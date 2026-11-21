import { createLoggerStorage } from "evlog/toolkit/storage";

const { storage, useLogger } = createLoggerStorage(
  "request middleware context. Ensure apps/web src/start.ts registers evlog requestMiddleware."
);

export { storage };

export const getRequestLogger = useLogger;

export function peekRequestLogger():
  | ReturnType<typeof storage.getStore>
  | undefined {
  return storage.getStore();
}

export function runWithRequestLogger<T>(
  logger: Parameters<typeof storage.run>[0],
  fn: () => T
): T {
  return storage.run(logger, fn);
}
