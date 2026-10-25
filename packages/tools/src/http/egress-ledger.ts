import { createHash, type Hash } from "node:crypto";

import { tapBody } from "./body-tap";
import type { CallObserver } from "./call-observer";
import {
  isRecordedResponseHeader,
  type BodyRecord,
  type CallFailure,
  type HashedReason,
  type PartialReason,
  type ProviderCall,
  type RequestBodyRecord,
} from "./provider-call";
import { redactLocation, redactUrl, SecretRegistry } from "./redact-url";

const MIB = 1024 * 1024;

/** How much body a Job keeps in memory for its calls; a body over a limit is hashed only. */
export type KeepLimits = {
  /** Largest body kept for one call. */
  readonly perCallBytes: number;
  /** Largest total kept across the Job's calls. */
  readonly perJobBytes: number;
};

export const DEFAULT_KEEP_LIMITS = {
  perCallBytes: 2 * MIB,
  perJobBytes: 16 * MIB,
} as const satisfies KeepLimits;

export type EgressLedgerOptions = {
  readonly keep?: Partial<KeepLimits>;
  /** Wall clock in epoch milliseconds, for `startedAt`. Default: `Date.now`. */
  readonly now?: () => number;
  /** Monotonic milliseconds, for durations. Default: `performance.now`. */
  readonly tick?: () => number;
};

/**
 * One Job's record of the calls its Caps made. Append-only: a call is added when it begins
 * and owns its record, so concurrent calls never write the same object.
 */
export type EgressLedger = {
  /**
   * Core calls this for each secret credential a Cap reads (`ctx.getCredential`). From then on
   * the value is replaced in every recorded URL, in its raw, percent-encoded and form-encoded
   * forms. A value under `MIN_SECRET_LENGTH` characters is ignored.
   */
  readonly registerSecret: (name: string, value: string) => void;
  /** Starts the record of one call; the returned observer goes to `outboundFetch`. */
  readonly begin: (call: {
    readonly method: string;
    readonly url: string | URL;
    readonly requestBody: RequestBodyRecord;
  }) => CallObserver;
  /**
   * Every call so far, in the order they began, as they stand now: a call whose body is still
   * being read is `open` with a `partial` body. Does not clear the ledger.
   */
  readonly drain: () => readonly ProviderCall[];
};

/** A hop as seen on the wire: the URL is redacted when the record is read, so a secret registered later is still found. */
type MutableHop = { url: string; status: number | null; attempts: number };

type BodyPhase = "reading" | "complete" | "stopped" | "failed";

/** Hashes and buffers one body as the consumer pulls it. */
type BodyAccumulator = {
  readonly add: (value: Uint8Array) => void;
  readonly finish: (phase: Exclude<BodyPhase, "reading">, cut: boolean) => void;
  readonly snapshot: () => BodyRecord;
};

function createBodyAccumulator(
  keep: KeepLimits,
  jobBudget: { used: number }
): BodyAccumulator {
  const hash: Hash = createHash("sha256");
  let chunks: Uint8Array[] = [];
  let reserved = 0;
  let keeping = true;
  let dropped: HashedReason | null = null;
  let bytes = 0;
  let phase: BodyPhase = "reading";
  let truncated = false;

  const drop = (reason: HashedReason) => {
    keeping = false;
    dropped = reason;
    jobBudget.used -= reserved;
    reserved = 0;
    chunks = [];
  };
  const data = () => {
    const out = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  };
  const partialReason = (): PartialReason => {
    if (phase === "failed") return "read_failed";
    return truncated ? "byte_cap" : "reader_stopped";
  };

  return {
    add: (value) => {
      hash.update(value);
      bytes += value.byteLength;
      if (!keeping) return;
      if (bytes > keep.perCallBytes) {
        drop("over_limit");
      } else if (jobBudget.used + value.byteLength > keep.perJobBytes) {
        drop("over_job_budget");
      } else {
        jobBudget.used += value.byteLength;
        reserved += value.byteLength;
        // A copy: the transport may reuse the memory behind a chunk.
        chunks.push(Uint8Array.from(value));
      }
    },
    finish: (next, cut) => {
      phase = next;
      truncated = next === "complete" && cut;
    },
    snapshot: () => {
      const sha256 = hash.copy().digest("hex");
      if (phase === "complete" && !truncated) {
        return keeping
          ? { state: "stored", sha256, bytes, data: data() }
          : { state: "hashed", sha256, bytes, reason: dropped ?? "over_limit" };
      }
      const reason = partialReason();
      return keeping
        ? { state: "partial", sha256, bytes, reason, data: data() }
        : { state: "partial", sha256, bytes, reason };
    },
  };
}

function causeCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
    current = current.cause;
  }
  return undefined;
}

/** The class of a failure, never its message: it could echo the target. */
function failureOf(error: unknown): CallFailure {
  if (!(error instanceof Error)) return { tag: "unknown" };
  const tag: unknown = "_tag" in error ? error._tag : undefined;
  let detail: unknown = causeCode(error);
  if ("reason" in error) detail = error.reason;
  else if ("kind" in error) detail = error.kind;
  return {
    tag: typeof tag === "string" ? tag : error.name || "Error",
    ...(typeof detail === "string" ? { reason: detail } : {}),
  };
}

type CallDeps = {
  readonly secrets: SecretRegistry;
  readonly keep: KeepLimits;
  readonly jobBudget: { used: number };
  readonly now: () => number;
  readonly tick: () => number;
};

type CallRecord = {
  readonly observer: CallObserver;
  readonly snapshot: () => ProviderCall;
};

/** The record of one call, written only by that call's own observer. */
function createCallRecord(
  seq: number,
  call: {
    readonly method: string;
    readonly url: string;
    readonly requestBody: RequestBodyRecord;
  },
  deps: CallDeps
): CallRecord {
  const { secrets, keep, jobBudget, now, tick } = deps;
  const hops: MutableHop[] = [];
  const headers: Record<string, string> = {};
  let finalUrl = "";
  let status: number | null = null;
  let headersAt: number | null = null;
  let endedAt: number | null = null;
  let failure: CallFailure | null = null;
  let accumulator: BodyAccumulator | null = null;
  let responded = false;
  const startedAt = now();
  const startedTick = tick();
  const elapsed = (at: number | null) =>
    at === null ? null : Math.max(0, at - startedTick);

  const settle: CallObserver["settle"] = (response, info) => {
    responded = true;
    status = response.status;
    headersAt = tick();
    finalUrl = info.url.href;
    for (const [name, value] of response.headers) {
      if (isRecordedResponseHeader(name)) headers[name.toLowerCase()] = value;
    }
    if (response.body === null) {
      endedAt = headersAt;
      return response;
    }
    const acc = createBodyAccumulator(keep, jobBudget);
    accumulator = acc;
    const finish = (phase: "complete" | "stopped" | "failed") => {
      acc.finish(phase, info.truncated());
      endedAt = tick();
    };
    return tapBody(response, info.url.href, {
      chunk: acc.add,
      end: () => {
        finish("complete");
      },
      cancelled: () => {
        finish("stopped");
      },
      failed: () => {
        finish("failed");
      },
    });
  };

  const observer: CallObserver = {
    hop: (url) => {
      hops.push({ url: url.href, status: null, attempts: 0 });
    },
    attempt: (outcome) => {
      const hop = hops.at(-1);
      if (hop === undefined) return;
      hop.attempts += 1;
      hop.status = "status" in outcome ? outcome.status : null;
    },
    settle,
    failed: (error) => {
      failure = failureOf(error);
      endedAt ??= tick();
    },
  };

  const snapshot = (): ProviderCall => {
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      responseHeaders[name] =
        name === "location"
          ? redactLocation(value, finalUrl, secrets)
          : secrets.replaceIn(value);
    }
    let outcome: ProviderCall["outcome"] = "failed";
    if (failure === null) {
      outcome = responded && endedAt === null ? "open" : "response";
    }
    return {
      seq,
      method: call.method,
      url: redactUrl(call.url, secrets),
      requestBody: call.requestBody,
      hops: hops.map((hop) => ({ ...hop, url: redactUrl(hop.url, secrets) })),
      outcome,
      status,
      responseHeaders,
      startedAt: new Date(startedAt).toISOString(),
      headersMs: elapsed(headersAt),
      durationMs: elapsed(endedAt),
      body: accumulator === null ? { state: "none" } : accumulator.snapshot(),
      failure,
    };
  };

  return { observer, snapshot };
}

/** A ledger for one Job. */
export function createEgressLedger(
  options: EgressLedgerOptions = {}
): EgressLedger {
  const keep: KeepLimits = { ...DEFAULT_KEEP_LIMITS, ...options.keep };
  const now = options.now ?? Date.now;
  const tick = options.tick ?? (() => performance.now());
  const secrets = new SecretRegistry();
  const jobBudget = { used: 0 };
  const records: CallRecord[] = [];
  return {
    registerSecret: (name, value) => {
      secrets.register(name, value);
    },
    begin: (call) => {
      const record = createCallRecord(
        records.length,
        {
          method: call.method.toUpperCase(),
          url: typeof call.url === "string" ? call.url : call.url.href,
          requestBody: call.requestBody,
        },
        { secrets, keep, jobBudget, now, tick }
      );
      records.push(record);
      return record.observer;
    },
    drain: () => records.map((record) => record.snapshot()),
  };
}
