/**
 * Optional log export over OTLP/HTTP. Off unless an endpoint is configured and parses. Delivery is
 * evlog's own `createOTLPDrain` behind `createDrainPipeline` (batched, bounded buffer, retried):
 * this module only validates the settings, scrubs each event with the same scrubber the error
 * reports use (`error-scrub.ts`), labels it, and counts what was dropped. `push` never throws and
 * never waits for the network.
 *
 * Contract: docs/reference/contracts/evlog.md#log-export-otlp.
 */

import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import type { DrainContext, LogLevel, WideEvent } from "evlog";
import { createOTLPDrain } from "evlog/otlp";
import { createDrainPipeline } from "evlog/pipeline";

import { createScrubber, type Scrubber } from "./error-scrub";

export type OtlpSettings = {
  readonly endpoint?: string | undefined;
  readonly headers?: string | undefined;
  readonly resourceAttributes?: string | undefined;
  readonly release?: string | undefined;
  readonly environment?: string | undefined;
  /** Secret values (from the validated env) removed from every string verbatim. */
  readonly secrets?: readonly string[];
};

type ParsedOtlp = {
  readonly endpoint: string;
  readonly headers: Record<string, string>;
  readonly resourceAttributes: Record<string, string>;
};

/** `off` is by choice; `invalid` names the setting (never its value) that left export off. */
export type OtlpParse =
  | { readonly kind: "off" }
  | { readonly kind: "invalid"; readonly setting: string }
  | { readonly kind: "on"; readonly parsed: ParsedOtlp };

const HEADER_NAME = /^[\w!#$%&'*+.^`|~-]+$/;
const MAX_PAIRS = 32;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** `a=b,c=d` (the OTEL list format), split on the first `=` so base64 padding survives. */
function parsePairs(
  list: string | undefined,
  validName: (name: string) => boolean
): Record<string, string> | null {
  const out: Record<string, string> = {};
  const text = list?.trim() ?? "";
  if (text === "") return out;
  const parts = text.split(",").filter((part) => part.trim() !== "");
  if (parts.length > MAX_PAIRS) return null;
  for (const part of parts) {
    const at = part.indexOf("=");
    const name = part.slice(0, Math.max(at, 0)).trim();
    const value = part.slice(at + 1).trim();
    if (at <= 0 || value === "" || !validName(name)) return null;
    out[name] = value;
  }
  return out;
}

function validHeaderValue(value: string): boolean {
  try {
    return new Headers([["x-check", value]]).has("x-check");
  } catch {
    return false;
  }
}

export function parseOtlpSettings(settings: OtlpSettings): OtlpParse {
  const endpoint = settings.endpoint?.trim() ?? "";
  if (endpoint === "") return { kind: "off" };
  if (!isHttpUrl(endpoint)) {
    return { kind: "invalid", setting: "WD_OTLP_ENDPOINT" };
  }
  const headers = parsePairs(settings.headers, (name) =>
    HEADER_NAME.test(name)
  );
  if (headers === null || !Object.values(headers).every(validHeaderValue)) {
    return { kind: "invalid", setting: "WD_OTLP_HEADERS" };
  }
  const resourceAttributes = parsePairs(
    settings.resourceAttributes,
    (name) => name !== ""
  );
  if (resourceAttributes === null) {
    return { kind: "invalid", setting: "WD_OTLP_RESOURCE_ATTRIBUTES" };
  }
  return { kind: "on", parsed: { endpoint, headers, resourceAttributes } };
}

export type OtlpStats = {
  /** Events handed to the exporter. */
  readonly accepted: number;
  /** Events lost: buffer overflow, or a batch that failed every attempt. */
  readonly dropped: number;
  /** Batches that failed every attempt (receiver down, erroring or timing out). */
  readonly failedBatches: number;
};

export type OtlpExporter = {
  /** Scrub and queue one wide event. Returns at once, never throws. */
  push: (event: Record<string, unknown>) => void;
  /** Deliver what is buffered (tests). Never rejects. */
  flush: () => Promise<void>;
  /**
   * Deliver what is buffered, waiting at most `timeoutMs`, then stop sending: a batch still in
   * flight is abandoned and retries end at once. For process shutdown. Never rejects.
   */
  shutdown: (timeoutMs: number) => Promise<void>;
  stats: () => OtlpStats;
};

export type OtlpExporterOptions = {
  readonly parsed: ParsedOtlp;
  readonly service: string;
  readonly release?: string | undefined;
  readonly environment?: string | undefined;
  readonly scrubber: Scrubber;
  readonly timeoutMs?: number;
  readonly batchSize?: number;
  readonly intervalMs?: number;
  readonly maxBuffer?: number;
  readonly retryDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_BATCH = 50;
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_MAX_BUFFER = 500;
const DEFAULT_RETRY_DELAY_MS = 500;
const TRACE_ID = /^[\da-f]{32}$/i;
const SPAN_ID = /^[\da-f]{16}$/i;
const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

function validId(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) && !/^0+$/.test(value)
    ? value
    : undefined;
}

function levelOf(value: unknown): LogLevel {
  return LEVELS.find((level) => level === value) ?? "info";
}

/**
 * The event evlog encodes: scrubbed with the shared scrubber, then labelled. Trace and span ids are
 * read before scrubbing (a 32-character hex id looks like a key to the scrubber) and restored only
 * when well-formed. `version` becomes `service.version`, `environment` becomes
 * `deployment.environment`; `requestId` and `job.jobId` stay attributes as logged.
 */
function exportable(
  event: Record<string, unknown>,
  options: OtlpExporterOptions
): WideEvent {
  const traceId = validId(event.traceId, TRACE_ID);
  const spanId = validId(event.spanId, SPAN_ID);
  const scrubbed = options.scrubber.scrubValue(event);
  const fields: Record<string, unknown> =
    typeof scrubbed === "object" && scrubbed !== null
      ? Object.fromEntries(Object.entries(scrubbed))
      : {};
  delete fields.traceId;
  delete fields.spanId;
  const environment = options.environment ?? fields.environment;
  return {
    ...fields,
    ...(traceId !== undefined && { traceId }),
    ...(spanId !== undefined && { spanId }),
    ...(options.release !== undefined && { version: options.release }),
    timestamp:
      typeof fields.timestamp === "string"
        ? fields.timestamp
        : new Date().toISOString(),
    level: levelOf(event.level),
    service: options.service,
    environment: typeof environment === "string" ? environment : "unknown",
  };
}

async function flushQuietly(pipeline: { flush: () => Promise<void> }) {
  try {
    await pipeline.flush();
  } catch {
    // never reaches the caller
  }
}

export function createOtlpExporter(options: OtlpExporterOptions): OtlpExporter {
  let accepted = 0;
  let dropped = 0;
  let failedBatches = 0;
  const drain = createOTLPDrain({
    endpoint: options.parsed.endpoint,
    headers: options.parsed.headers,
    resourceAttributes: options.parsed.resourceAttributes,
    serviceName: options.service,
    recordShape: "compact",
    semanticConventions: true,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: 0,
  });
  const closing = new AbortController();
  const closed = once(closing.signal, "abort");
  // The raw drain rejects on failure (so the pipeline retries and counts); `closed` ends it early.
  const sendBatch = async (batch: DrainContext[]): Promise<"sent"> => {
    await drain.raw(batch);
    return "sent";
  };
  const send = async (batch: DrainContext[]): Promise<void> => {
    const outcome = await Promise.race([sendBatch(batch), closed]);
    if (outcome !== "sent") throw new Error("OTLP exporter closed");
  };
  const pipeline = createDrainPipeline<DrainContext>({
    batch: {
      size: options.batchSize ?? DEFAULT_BATCH,
      intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
    },
    retry: {
      maxAttempts: 2,
      initialDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      maxDelayMs: 2000,
    },
    maxBufferSize: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    // Counted, never logged: a log line here would itself be exported and could loop.
    onDropped: (events, error) => {
      dropped += events.length;
      if (error !== undefined) failedBatches += 1;
    },
  })(send);

  return {
    push: (event) => {
      try {
        const wide = exportable(event, options);
        accepted += 1;
        pipeline({ event: wide });
      } catch {
        dropped += 1;
      }
    },
    flush: async () => {
      try {
        await pipeline.flush();
      } catch {
        // never reaches the caller
      }
    },
    shutdown: async (timeoutMs) => {
      const cancel = new AbortController();
      try {
        await Promise.race([
          flushQuietly(pipeline),
          delay(timeoutMs, undefined, { signal: cancel.signal, ref: false }),
        ]);
      } finally {
        cancel.abort();
        closing.abort();
      }
    },
    stats: () => ({ accepted, dropped, failedBatches }),
  };
}

export type OtlpSetup = {
  readonly exporter: OtlpExporter | null;
  /** One line for the log when a value was unusable; never contains the value. */
  readonly warning: string | null;
};

/** Settings to exporter. Unset gives no exporter and no warning; invalid gives no exporter and one. */
export function setUpOtlpExport(
  settings: OtlpSettings | undefined,
  service: string
): OtlpSetup {
  if (settings === undefined) return { exporter: null, warning: null };
  const parse = parseOtlpSettings(settings);
  if (parse.kind === "off") return { exporter: null, warning: null };
  if (parse.kind === "invalid") {
    return {
      exporter: null,
      warning: `${parse.setting} is not valid; log export over OTLP is off`,
    };
  }
  const scrubber = createScrubber({
    secrets: [
      parse.parsed.endpoint,
      ...Object.values(parse.parsed.headers),
      ...(settings.secrets ?? []),
    ],
  });
  return {
    exporter: createOtlpExporter({
      parsed: parse.parsed,
      service,
      release: settings.release,
      environment: settings.environment,
      scrubber,
    }),
    warning: null,
  };
}
