/**
 * `/api/**` paths the app's own request middleware (`src/start.ts`) does not log. The container
 * server's edge logger (`request-log.server.ts`) logs exactly these, so every request is logged
 * once. Kept out of the `.server` module because `start.ts` imports it at the top level.
 */
export const EDGE_LOGGED_API: readonly string[] = [
  "/api/v1/health",
  "/api/v1/ready",
  "/api/v1/spec.json",
  "/api/v1/",
  "/api/v1",
];

/** Server functions live under `/_serverFn/<id>`; `/_serverFnord` is just a missing page. */
export function isServerFnPath(pathname: string): boolean {
  return pathname.startsWith("/_serverFn/");
}
