/**
 * The origins an install trusts: Better Auth's `trustedOrigins` and the CORS
 * allowlist of the API and live-update routes are both this list.
 *
 * Pure (no env read) so tests and the browser-safe entry points can use it;
 * `configuredTrustedOrigins` in `create-auth.ts` feeds it the validated env.
 */

/** Ports a local dev server falls back to when 3000 is taken. */
const LOCAL_DEV_PORTS = ["3000", "3001", "3002", "3010", "3300"];

/**
 * The public URL, its `localhost` / `127.0.0.1` twin (browsers treat them as
 * different origins) and the configured extras. Outside production a local URL
 * also trusts the common dev-server fallback ports; in production it trusts
 * only its own port.
 */
export function expandTrustedOrigins(
  base: string,
  extra: readonly string[],
  options: { isProduction: boolean }
): string[] {
  const origins = new Set<string>([base]);
  try {
    const url = new URL(base);
    const isLocal =
      url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const hosts = isLocal ? ["127.0.0.1", "localhost"] : [url.hostname];
    const ports =
      isLocal && !options.isProduction
        ? [...LOCAL_DEV_PORTS, url.port || "3000"]
        : [url.port];
    for (const host of hosts) {
      for (const port of new Set(ports)) {
        origins.add(`${url.protocol}//${host}${port ? `:${port}` : ""}`);
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
