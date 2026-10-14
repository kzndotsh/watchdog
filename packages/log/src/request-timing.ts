/**
 * Per-request timing for the request wide event: wall time plus how many
 * database calls ran and how long they took in total.
 *
 * Counts and durations only. Never SQL text, parameters, rows or bodies.
 *
 * The accumulator hangs off the request logger that `runWithRequestLogger`
 * already puts in AsyncLocalStorage, so there is no second context. Outside a
 * request (worker, CLI, tests without a logger) `timedDbCall` finds no
 * accumulator and just runs the call: no state is allocated and nothing throws.
 */

import type { DbLogFields, RequestTimingLogFields } from "./fields";
import { peekRequestLogger } from "./storage";

export type RequestTiming = RequestTimingLogFields;

// Keyed by the request logger: a request that ends drops its logger and the
// entry with it.
const totalsByLogger = new WeakMap<object, DbLogFields>();

/** Round to 0.1 ms: finer is noise in a log line. */
function tenthMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/**
 * Begin timing the request whose logger is `logger` (call it where the logger
 * is created, before the handler runs). Returns a snapshot function: call it
 * as the request ends to read the totals so far.
 */
export function startRequestTiming(logger: object): () => RequestTiming {
  const totals: DbLogFields = { queries: 0, ms: 0 };
  totalsByLogger.set(logger, totals);
  const startedAt = performance.now();
  return () => ({
    durationMs: tenthMs(performance.now() - startedAt),
    db: { queries: totals.queries, ms: tenthMs(totals.ms) },
  });
}

/**
 * Run one database call, adding it to the current request's totals. This is
 * the single seam: core's `tryDb` calls it for every statement. `ms` is the sum
 * of per-call times, so overlapping calls can add up to more than `durationMs`.
 */
export async function timedDbCall<A>(call: () => Promise<A>): Promise<A> {
  const logger = peekRequestLogger();
  const totals = logger === undefined ? undefined : totalsByLogger.get(logger);
  if (totals === undefined) {
    return call();
  }
  const startedAt = performance.now();
  return call().finally(() => {
    totals.queries += 1;
    totals.ms += performance.now() - startedAt;
  });
}

/** `Server-Timing` value: `db` is summed database time, `app` the request's total. */
export function serverTimingHeader(timing: RequestTiming): string {
  return `db;dur=${timing.db.ms}, app;dur=${timing.durationMs}`;
}

/** Dev and test only: an allowlist, so an unset or unknown `NODE_ENV` stays off. */
export function shouldEmitServerTiming(nodeEnv: string | undefined): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}

/**
 * Return `response` carrying a `Server-Timing` header. Mutates when the
 * headers are writable; otherwise (a fetch Response is immutable) rebuilds it
 * around the same body stream. A header is a debugging aid: if the response
 * cannot be rebuilt (its body is already locked or used), return it unchanged
 * rather than fail the request.
 */
export function withServerTiming(response: Response, value: string): Response {
  try {
    response.headers.set("Server-Timing", value);
    return response;
  } catch {
    try {
      const headers = new Headers(response.headers);
      headers.set("Server-Timing", value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  }
}
