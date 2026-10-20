/**
 * Optional error reporting behind the logger. Off unless `configureErrorReporting` is called with a
 * sink: until then every function here is a no-op and nothing leaves the process. The logger's drain
 * hands every error-level wide event to `reportWideEvent`; uncaught failures and the browser
 * endpoint call `reportError`. A report is scrubbed (`error-scrub.ts`), rate limited and sent without
 * the caller waiting: a sink that throws, hangs or rejects never reaches the request path.
 *
 * Contract: docs/reference/contracts/evlog.md#error-reporting.
 */

import { setTimeout as delay } from "node:timers/promises";

import { createScrubber, type Scrubber } from "./error-scrub";

export type ErrorLevel = "error" | "fatal";

/** What a sink receives: already scrubbed, vendor-neutral. */
export type ErrorReport = {
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
  readonly level: ErrorLevel;
  readonly service: string;
  readonly release: string | undefined;
  readonly environment: string | undefined;
  /** Route / procedure / Job id / request id and similar short fields; never bodies. */
  readonly context: Readonly<Record<string, unknown>>;
  /** Unix ms. */
  readonly timestamp: number;
};

/** A destination for reports. `send` may reject or hang: the reporter bounds and swallows it. */
export type ErrorSink = {
  send: (report: ErrorReport) => Promise<void>;
};

export type ErrorReportingConfig = {
  readonly sink: ErrorSink;
  readonly service: string;
  readonly release?: string;
  readonly environment?: string;
  /** Secret values removed from every string verbatim (see `sensitiveEnvValues` in `@watchdog/env/server`). */
  readonly secrets?: readonly string[];
  /** Reports sent per minute at most; the rest are dropped. */
  readonly maxPerMinute?: number;
  /** Clock for the rate limit; tests only. */
  readonly now?: () => number;
};

const DEFAULT_MAX_PER_MINUTE = 30;
const WINDOW_MS = 60_000;
/** Sends in flight at once; past this a report is dropped rather than queued without bound. */
const MAX_IN_FLIGHT = 10;
const DEFAULT_FLUSH_MS = 2000;
const FLUSH_POLL_MS = 20;

type Active = {
  readonly config: ErrorReportingConfig;
  readonly scrubber: Scrubber;
  inFlight: number;
  windowStart: number;
  sentInWindow: number;
};

let active: Active | null = null;

export function configureErrorReporting(config: ErrorReportingConfig): void {
  const now = config.now ?? Date.now;
  active = {
    config,
    scrubber: createScrubber({ secrets: config.secrets }),
    inFlight: 0,
    windowStart: now(),
    sentInWindow: 0,
  };
}

/** Turn reporting off again (tests, and an HMR re-init). */
export function resetErrorReporting(): void {
  active = null;
}

export function isErrorReportingEnabled(): boolean {
  return active !== null;
}

function admit(state: Active): boolean {
  const now = (state.config.now ?? Date.now)();
  if (now - state.windowStart >= WINDOW_MS) {
    state.windowStart = now;
    state.sentInWindow = 0;
  }
  const limit = state.config.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE;
  if (state.sentInWindow >= limit || state.inFlight >= MAX_IN_FLIGHT) {
    return false;
  }
  state.sentInWindow += 1;
  return true;
}

type ErrorParts = { name: string; message: string; stack: string | undefined };

function partsOf(error: unknown): ErrorParts {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "object" && error !== null) {
    const name: unknown = Reflect.get(error, "name");
    const message: unknown = Reflect.get(error, "message");
    const stack: unknown = Reflect.get(error, "stack");
    if (typeof message === "string") {
      return {
        name: typeof name === "string" ? name : "Error",
        message,
        stack: typeof stack === "string" ? stack : undefined,
      };
    }
  }
  return {
    name: "Error",
    message: typeof error === "string" ? error : "Non-error value thrown",
    stack: undefined,
  };
}

/** Send one report; a failing or hanging sink is swallowed and never reaches the caller. */
async function deliver(state: Active, report: ErrorReport): Promise<void> {
  try {
    await state.config.sink.send(report);
  } catch {
    // A reporter must never fail the thing it reports on.
  } finally {
    state.inFlight -= 1;
  }
}

function dispatch(
  state: Active,
  parts: ErrorParts,
  level: ErrorLevel,
  context: Record<string, unknown>
): void {
  if (!admit(state)) return;
  const { scrubText, scrubValue } = state.scrubber;
  const scrubbed = scrubValue(context);
  const report: ErrorReport = {
    name: scrubText(parts.name),
    message: scrubText(parts.message),
    stack: parts.stack === undefined ? undefined : scrubText(parts.stack),
    level,
    service: state.config.service,
    release: state.config.release,
    environment: state.config.environment,
    context:
      typeof scrubbed === "object" &&
      scrubbed !== null &&
      !Array.isArray(scrubbed)
        ? Object.fromEntries(Object.entries(scrubbed))
        : {},
    timestamp: (state.config.now ?? Date.now)(),
  };
  state.inFlight += 1;
  void deliver(state, report);
}

/**
 * Report one failure. Returns at once; never throws. `context` carries short fields (route,
 * procedure, Job id, request id): it is scrubbed, but keep Evidence and bodies out of it.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  level: ErrorLevel = "error"
): void {
  const state = active;
  if (state === null) return;
  try {
    dispatch(state, partsOf(error), level, context);
  } catch {
    // never reaches the caller
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** The wide-event fields a report carries: where it happened, never what the request held. */
function eventContext(event: Record<string, unknown>): Record<string, unknown> {
  const job = asRecord(event.job);
  const cap = asRecord(event.cap);
  const context: Record<string, unknown> = {
    requestId: str(event.requestId),
    method: str(event.method),
    path: str(event.path),
    status: typeof event.status === "number" ? event.status : undefined,
    operation: str(event.operation),
    scope: str(event.scope),
    jobId: str(job?.jobId),
    capabilityId: str(cap?.capabilityId),
  };
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  );
}

/** The failure inside a wide event: `error` as an Error shape, or its mapped `cause` (API 500s). */
function eventError(event: Record<string, unknown>): ErrorParts {
  const error = asRecord(event.error);
  if (error === null) {
    const status = typeof event.status === "number" ? event.status : 500;
    return {
      name: "Error",
      message: str(event.message) ?? `Request failed with status ${status}`,
      stack: undefined,
    };
  }
  const cause = asRecord(error.cause);
  if (cause !== null && str(cause.message) !== undefined) return partsOf(cause);
  if (str(error.message) !== undefined) return partsOf(error);
  return {
    name: str(error.domainTag) ?? "Error",
    message: str(error.reason) ?? str(event.message) ?? "Unknown failure",
    stack: undefined,
  };
}

/**
 * Called by the logger's drain for every emitted wide event: reports the error-level ones
 * (including a 5xx request whose cause was set as a field). Never throws.
 */
export function reportWideEvent(event: Record<string, unknown>): void {
  const state = active;
  if (state === null) return;
  try {
    const { level, status } = event;
    const failed =
      level === "error" ||
      level === "fatal" ||
      (typeof status === "number" && status >= 500);
    if (!failed) return;
    dispatch(
      state,
      eventError(event),
      level === "fatal" ? "fatal" : "error",
      eventContext(event)
    );
  } catch {
    // never reaches the caller
  }
}

/** Wait (bounded) for reports in flight; used before a crashing process exits. */
export async function flushErrorReports(
  timeoutMs = DEFAULT_FLUSH_MS
): Promise<void> {
  const state = active;
  if (state === null) return;
  const deadline = Date.now() + timeoutMs;
  while (state.inFlight > 0 && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling: each wait depends on the count the last one left
    await delay(FLUSH_POLL_MS, undefined, { ref: false });
  }
}

async function crash(
  origin: string,
  error: unknown,
  target: NodeJS.Process
): Promise<void> {
  reportError(error, { scope: `process.${origin}` }, "fatal");
  await flushErrorReports();
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`watchdog: ${origin}: ${detail}\n`);
  target.exit(1);
}

/**
 * Report uncaught exceptions and unhandled rejections, then exit 1 as Node does by default.
 * Installed only when reporting is configured, so an unconfigured process keeps Node's own handling.
 */
export function installProcessErrorHandlers(
  target: NodeJS.Process = process
): void {
  for (const origin of ["uncaughtException", "unhandledRejection"] as const) {
    target.on(origin, (error: unknown) => {
      void crash(origin, error, target);
    });
  }
}
