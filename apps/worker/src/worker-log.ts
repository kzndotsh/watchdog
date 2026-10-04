import { createLogger } from "@watchdog/log";

export function emitOnce(scope: string, fields: Record<string, unknown>): void {
  const log = createLogger({ scope });
  log.set(fields);
  void log.emit();
}

export function logWorkerError(
  scope: string,
  message: string,
  error: unknown
): void {
  const log = createLogger({ scope });
  log.set({ message });
  log.error(error instanceof Error ? error : new Error(String(error)));
  void log.emit();
}
