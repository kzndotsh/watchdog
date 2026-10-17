/**
 * The one parser of the `WD_EGRESS_PROXY` setting, shared by the env schema and
 * the outbound client in `@watchdog/tools/http`. Pure: no process state, so the
 * client can import it without loading the validated server env.
 *
 * Returns the proxy URL when `raw` is an http(s) URL, otherwise `null`.
 */
export function parseEgressProxyUrl(raw: string): URL | null {
  try {
    const proxy = new URL(raw.trim());
    return proxy.protocol === "http:" || proxy.protocol === "https:"
      ? proxy
      : null;
  } catch {
    return null;
  }
}
