import { createHash, randomUUID, type Hash } from "node:crypto";

import { tapBody } from "./body-tap";
import type { CallObserver } from "./call-observer";
import {
  isRecordedResponseHeader,
  type BodyKind,
  type BodyRecord,
  type CallTransport,
  type CallFailure,
  type HashedReason,
  type PartialReason,
  type ProviderCall,
  type RequestBodyRecord,
  type ServedSource,
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
  /**
   * What the Job does with response bodies it reads. `hash_only` hashes every body and keeps
   * none (a Cap whose provider data is never stored, `breach.*`); the default keeps a body up
   * to the keep limits. A model call is always hash-only.
   */
  readonly bodyPolicy?: "keep" | "hash_only";
  /**
   * Write-ahead: called with the request side of each call as it begins, before it is sent. The
   * door waits for the returned promise, so a record that cannot be saved stops the call
   * instead of letting it go unrecorded; the call is marked failed and the rejection goes to the
   * Cap. Absent, nothing is saved here (the record stays in memory).
   */
  readonly onCallStart?: (call: ProviderCall) => Promise<void>;
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
  /**
   * Starts the record of one HTTP call; the returned observer goes to `outboundFetch`.
   * `bodyPolicy: "hash_only"` hashes the response body and never keeps it (model responses).
   */
  readonly begin: (call: {
    readonly method: string;
    readonly url: string | URL;
    readonly requestBody: RequestBodyRecord;
    readonly bodyPolicy?: "keep" | "hash_only";
  }) => LedgerObserver;
  /** Starts the record of one DNS or TLS call, which do not go through `outboundFetch`. */
  readonly beginDirect: (call: DirectCallStart) => DirectCall;
  /**
   * Records a call an in-process cache answered: no wire call, a `served_from` outcome naming the
   * original (`source`), and the original's body hash. Returns the `written` promise like a begun call.
   */
  readonly recordServed: (source: ServedSource) => Written;
  /**
   * The newest completed call to `url` that went on the wire in this Job, as a `ServedSource`
   * for a cache to keep beside the value it built from the answer; `undefined` when there is
   * none, or its body was not read to the end.
   */
  readonly servedSourceFor: (url: string) => ServedSource | undefined;
  /**
   * Every call so far, in the order they began, as they stand now: a call whose body is still
   * being read is `open` with a `partial` body. Does not clear the ledger.
   */
  readonly drain: () => readonly ProviderCall[];
  /** How many calls have begun. Copies nothing, unlike `drain`. */
  readonly count: () => number;
};

/**
 * Settles when the write-ahead hook has saved the request side of a call, or rejects with its
 * error. Resolved at once when the ledger has no hook. A door awaits it before it sends.
 */
export type Written = {
  readonly callId: string;
  readonly written: Promise<void>;
};

/** The observer of an HTTP call, with the identity and write-ahead promise of its record. */
export type LedgerObserver = CallObserver & Written;

/** A call through one of the Job's own doors (DNS, TLS) rather than the HTTP client. */
export type DirectCallStart = {
  readonly transport: Exclude<CallTransport, "http">;
  readonly method: string;
  readonly url: string;
  readonly bodyKind: Exclude<BodyKind, "response">;
};

/** The one record of a direct call, completed exactly once by the door that made it. */
export type DirectCall = Written & {
  /** The call got its answer: the status and the body bytes it is hashed over. */
  readonly answered: (result: {
    readonly status: number;
    readonly body: Uint8Array;
  }) => void;
  /** The call failed before an answer (a refusal, a limit, a transport error, an abort). */
  readonly failed: (error: unknown) => void;
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
  jobBudget: { used: number },
  hashOnly: boolean
): BodyAccumulator {
  const hash: Hash = createHash("sha256");
  let chunks: Uint8Array[] = [];
  let reserved = 0;
  let keeping = !hashOnly;
  let dropped: HashedReason | null = hashOnly ? "hash_only" : null;
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
  readonly onCallStart: ((call: ProviderCall) => Promise<void>) | undefined;
};

type CallRecord = {
  readonly id: string;
  readonly observer: LedgerObserver;
  readonly direct: DirectCall;
  readonly served: Written;
  readonly snapshot: () => ProviderCall;
};

type CallStart = {
  readonly method: string;
  readonly url: string;
  readonly requestBody: RequestBodyRecord;
  readonly transport: CallTransport;
  readonly bodyKind: BodyKind;
  readonly hashOnly: boolean;
  /** A call an in-process cache answered: nothing goes on the wire. */
  readonly servedFrom?: ServedSource;
};

/** The record of one call, written only by that call's own observer. */
function createCallRecord(
  seq: number,
  call: CallStart,
  deps: CallDeps
): CallRecord {
  const { secrets, keep, jobBudget, now, tick } = deps;
  const id = randomUUID();
  const source = call.servedFrom;
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

  if (source !== undefined) {
    responded = true;
    status = source.status;
    headersAt = startedTick;
    endedAt = startedTick;
    Object.assign(headers, source.responseHeaders);
    hops.push({ url: call.url, status: source.status, attempts: 0 });
  }

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
    const acc = createBodyAccumulator(keep, jobBudget, call.hashOnly);
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

  // A direct call has one hop, its own target, so its record reads like an HTTP call's.
  const direct: Omit<DirectCall, keyof Written> = {
    answered: (result) => {
      responded = true;
      status = result.status;
      headersAt = tick();
      hops.push({ url: call.url, status: result.status, attempts: 1 });
      const acc = createBodyAccumulator(keep, jobBudget, call.hashOnly);
      acc.add(result.body);
      acc.finish("complete", false);
      accumulator = acc;
      endedAt = headersAt;
    },
    failed: (error) => {
      hops.push({ url: call.url, status: null, attempts: 1 });
      failure = failureOf(error);
      endedAt ??= tick();
    },
  };

  const outcomeOf = (): ProviderCall["outcome"] => {
    if (source !== undefined) return "served_from";
    if (failure !== null) return "failed";
    if (!responded) return "pending";
    return endedAt === null ? "open" : "response";
  };

  const bodyOf = (): BodyRecord => {
    if (source !== undefined) {
      return { state: "hashed", ...source.body, reason: "served_from" };
    }
    return accumulator === null ? { state: "none" } : accumulator.snapshot();
  };

  const snapshot = (): ProviderCall => {
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      responseHeaders[name] =
        name === "location"
          ? redactLocation(value, finalUrl, secrets)
          : secrets.replaceIn(value);
    }
    return {
      id,
      seq,
      transport: call.transport,
      method: call.method,
      url: redactUrl(call.url, secrets),
      bodyKind: call.bodyKind,
      requestBody: call.requestBody,
      hops: hops.map((hop) => ({ ...hop, url: redactUrl(hop.url, secrets) })),
      outcome: outcomeOf(),
      servedFrom: source?.callId ?? null,
      status,
      responseHeaders,
      startedAt: new Date(startedAt).toISOString(),
      headersMs: elapsed(headersAt),
      durationMs: elapsed(endedAt),
      body: bodyOf(),
      failure,
    };
  };

  // Write-ahead: the request side is handed over before the door sends anything. A hook that
  // fails marks the call failed (it never went out) and the door gets the rejection.
  const saveRequestSide = async (
    save: (call: ProviderCall) => Promise<void>
  ): Promise<void> => {
    try {
      await save(snapshot());
    } catch (error) {
      failure = failureOf(error);
      endedAt ??= tick();
      throw error;
    }
  };
  const written: Promise<void> =
    deps.onCallStart === undefined
      ? Promise.resolve()
      : saveRequestSide(deps.onCallStart);
  // The door awaits it and reports a failure; this only keeps a call nobody awaited from raising
  // an unhandled rejection.
  void (async () => {
    try {
      await written;
    } catch {
      // Reported by the door that awaits `written`.
    }
  })();
  const identity: Written = { callId: id, written };

  return {
    id,
    observer: { ...observer, ...identity },
    direct: { ...direct, ...identity },
    served: identity,
    snapshot,
  };
}

/** A URL in its canonical form, so `https://host` and `https://host/` name the same request. */
function hrefOf(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/** The source a cache keeps for a call, only when its body was read to the end. */
function servedSourceOf(call: ProviderCall): ServedSource | undefined {
  const { body } = call;
  const complete =
    call.outcome === "response" &&
    (body.state === "stored" || body.state === "hashed");
  return complete
    ? {
        callId: call.id,
        transport: call.transport,
        method: call.method,
        url: call.url,
        bodyKind: call.bodyKind,
        status: call.status,
        responseHeaders: call.responseHeaders,
        body: { sha256: body.sha256, bytes: body.bytes },
      }
    : undefined;
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
  const hashOnlyByDefault = options.bodyPolicy === "hash_only";
  const deps: CallDeps = {
    secrets,
    keep,
    jobBudget,
    now,
    tick,
    onCallStart: options.onCallStart,
  };
  const add = (call: CallStart): CallRecord => {
    const record = createCallRecord(records.length, call, deps);
    records.push(record);
    return record;
  };
  // The newest HTTP call to each URL as asked (the snapshot's URL is redacted).
  const latestByUrl = new Map<string, CallRecord>();
  return {
    registerSecret: (name, value) => {
      secrets.register(name, value);
    },
    begin: (call) => {
      const url = typeof call.url === "string" ? call.url : call.url.href;
      const record = add({
        method: call.method.toUpperCase(),
        url,
        requestBody: call.requestBody,
        transport: "http",
        bodyKind: "response",
        hashOnly: hashOnlyByDefault || call.bodyPolicy === "hash_only",
      });
      latestByUrl.set(hrefOf(url), record);
      return record.observer;
    },
    beginDirect: (call) =>
      add({
        method: call.method,
        url: call.url,
        requestBody: { state: "none" },
        transport: call.transport,
        bodyKind: call.bodyKind,
        hashOnly: hashOnlyByDefault,
      }).direct,
    recordServed: (source) =>
      add({
        method: source.method,
        url: source.url,
        requestBody: { state: "none" },
        transport: source.transport,
        bodyKind: source.bodyKind,
        hashOnly: true,
        servedFrom: source,
      }).served,
    servedSourceFor: (url) => {
      const record = latestByUrl.get(hrefOf(url));
      return record === undefined
        ? undefined
        : servedSourceOf(record.snapshot());
    },
    drain: () => records.map((record) => record.snapshot()),
    count: () => records.length,
  };
}
