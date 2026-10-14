/** Thrown by `requireSession` when no session — detectable without string matching. */
export class UnauthorizedError extends Error {
  override readonly name = "UnauthorizedError";

  constructor(message = "Unauthorized") {
    super(message);
  }
}

/**
 * Client-side detection of a server-function denial. The error crosses the wire as a plain
 * `Error`, so the class is gone: match the stable name or the default message exactly
 * (not a substring, so "Forbidden: unauthorized caller" is not a session problem).
 */
export function isUnauthorizedFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "UnauthorizedError" || error.message === "Unauthorized")
  );
}

export function isUnauthorizedError(
  error: unknown
): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}
