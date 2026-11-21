import { ORPCError } from "@orpc/server";

/** Transport code a refused Job start (`job_start_limited`) travels as. */
const JOB_START_LIMITED_TRANSPORT = "TOO_MANY_REQUESTS";

/**
 * Seconds a caller should wait before starting a Job again, read off the mapped
 * `job_start_limited` error; undefined for any other error.
 */
export function retryAfterSecondsOf(error: unknown): number | undefined {
  if (
    !(error instanceof ORPCError) ||
    error.code !== JOB_START_LIMITED_TRANSPORT
  ) {
    return undefined;
  }
  const data: unknown = error.data;
  const seconds =
    typeof data === "object" && data !== null && "retryAfterSeconds" in data
      ? data.retryAfterSeconds
      : undefined;
  return typeof seconds === "number" && Number.isInteger(seconds) && seconds > 0
    ? seconds
    : undefined;
}

/** Put `Retry-After` on the response being built when `error` is a refused Job start. */
export function setRetryAfter(
  headers: Headers | undefined,
  error: unknown
): void {
  const seconds = retryAfterSecondsOf(error);
  if (headers !== undefined && seconds !== undefined) {
    headers.set("retry-after", String(seconds));
  }
}

/**
 * The 429 answer for a route outside the oRPC router (the Case export download) whose Job start
 * was refused: the same JSON error body the router sends, plus `Retry-After`. Null for any other
 * error, which the caller rethrows.
 */
export function jobStartLimitResponse(error: unknown): Response | null {
  const seconds = retryAfterSecondsOf(error);
  if (seconds === undefined || !(error instanceof ORPCError)) return null;
  return Response.json(error.toJSON(), {
    status: 429,
    headers: { "Retry-After": String(seconds) },
  });
}
