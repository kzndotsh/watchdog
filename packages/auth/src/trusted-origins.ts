/**
 * The origins an install trusts: Better Auth's `trustedOrigins` and the CORS
 * allowlist of the API and live-update routes are both this list.
 *
 * Pure (no env read) so tests and the browser-safe entry points can use it;
 * `configuredTrustedOrigins` in `create-auth.ts` feeds it the validated env.
 */

/** Accept both localhost and 127.0.0.1: browsers treat them as different origins. */
export function expandTrustedOrigins(
  base: string,
  extra: readonly string[]
): string[] {
  const origins = new Set<string>([base]);
  try {
    const url = new URL(base);
    const hosts =
      url.hostname === "127.0.0.1" || url.hostname === "localhost"
        ? ["127.0.0.1", "localhost"]
        : [url.hostname];
    // Vite falls back to 3001+ when 3000 is taken: trust common local ports.
    const ports =
      url.hostname === "127.0.0.1" || url.hostname === "localhost"
        ? ["3000", "3001", "3002", "3010", "3300", url.port || "3000"]
        : [url.port];
    for (const host of hosts) {
      for (const port of new Set(ports.filter(Boolean))) {
        origins.add(`${url.protocol}//${host}:${port}`);
      }
    }
  } catch {
    // keep base only
  }
  for (const trimmed of extra) {
    if (trimmed) origins.add(trimmed);
  }
  return [...origins];
}
