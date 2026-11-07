/** Expand any valid IPv6 spelling to eight zero-padded hextets; throws on a malformed one. */
export function expandIpv6(ip: string): string {
  const parts = ip.split("::");
  if (parts.length > 2) throw new Error(`Invalid IPv6: ${ip}`);
  const head =
    parts[0] !== undefined && parts[0] !== "" ? parts[0].split(":") : [];
  const tail =
    parts[1] !== undefined && parts[1] !== "" ? parts[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  const full = [
    ...head,
    ...Array.from({ length: Math.max(missing, 0) }, () => "0"),
    ...tail,
  ];
  if (full.length !== 8) throw new Error(`Invalid IPv6: ${ip}`);
  return full.map((h) => h.padStart(4, "0")).join(":");
}

function stripIpv6Hextets(parts: string[]): string[] {
  return parts.map((h) => {
    const trimmed = h.replace(/^0+/, "");
    return trimmed === "" ? "0" : trimmed;
  });
}

/** RFC 5952-style compressed lowercase IPv6 (input may be any valid spelling; browser-safe, no node:net). */
export function compressIpv6(ip: string): string {
  const parts = stripIpv6Hextets(expandIpv6(ip).toLowerCase().split(":"));

  let bestStart = 0;
  let bestLen = 0;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== "0") continue;
    let len = 0;
    while (i + len < parts.length && parts[i + len] === "0") len += 1;
    if (len > bestLen) {
      bestLen = len;
      bestStart = i;
    }
  }

  if (bestLen < 2) {
    return parts.join(":");
  }

  const before = parts.slice(0, bestStart);
  const after = parts.slice(bestStart + bestLen);
  if (before.length === 0 && after.length === 0) return "::";
  if (before.length === 0) return `::${after.join(":")}`;
  if (after.length === 0) return `${before.join(":")}::`;
  return `${before.join(":")}::${after.join(":")}`;
}
