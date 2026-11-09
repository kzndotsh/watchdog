import { createLogger } from "@watchdog/log";

/**
 * Process log for an auth hook failure that must not fail the request (a session still
 * starts). Carries the error and ids only: never an email, a token or a request body.
 */
export function logAuthHookFailure(
  scope: string,
  error: unknown,
  ids: Readonly<Record<string, string>>
): void {
  const log = createLogger({ scope, ...ids });
  log.error(error instanceof Error ? error : new Error(String(error)));
  void log.emit();
}
