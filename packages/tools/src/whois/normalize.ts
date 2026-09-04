/** Strip scheme/path and trailing dot from a host label (DNS + WHOIS Collect). */
export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("https://")) h = h.slice("https://".length);
  else if (h.startsWith("http://")) h = h.slice("http://".length);
  const slash = h.indexOf("/");
  if (slash !== -1) h = h.slice(0, slash);
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}
