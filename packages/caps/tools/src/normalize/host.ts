function stripPort(host: string): string {
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close === -1) return host;
    const rest = host.slice(close + 1);
    if (rest.startsWith(":") && /^\d+$/.test(rest.slice(1))) {
      return host.slice(0, close + 1);
    }
    return host;
  }
  const colon = host.lastIndexOf(":");
  const colonCount = (host.match(/:/g) ?? []).length;
  if (colonCount === 1 && colon !== -1 && /^\d+$/.test(host.slice(colon + 1))) {
    return host.slice(0, colon);
  }
  return host;
}

/** Strip scheme/path, port, and trailing dot from a host label (DNS + WHOIS Collect). */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("https://")) h = h.slice("https://".length);
  else if (h.startsWith("http://")) h = h.slice("http://".length);
  const slash = h.indexOf("/");
  if (slash !== -1) h = h.slice(0, slash);
  if (h.endsWith(".")) h = h.slice(0, -1);
  return stripPort(h);
}
