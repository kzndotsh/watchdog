import { createLogger } from "@watchdog/log";

/** The Postgres SQLSTATE of a driver error (or its cause), when there is one. */
function sqlState(error: unknown): string | undefined {
  for (let current = error, depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Process log for an auth hook failure that must not fail the request (a session still
 * starts). The message is fixed and the fields are ids plus the error's class and SQLSTATE:
 * a driver error's own message carries the query parameters (the session's IP address and
 * User-Agent), so it never reaches the log.
 */
export function logAuthHookFailure(
  scope: string,
  error: unknown,
  ids: Readonly<Record<string, string>>
): void {
  const log = createLogger({
    scope,
    ...ids,
    errorName: error instanceof Error ? error.name : typeof error,
    sqlState: sqlState(error),
  });
  log.error(new Error(`${scope} failed`));
  void log.emit();
}
