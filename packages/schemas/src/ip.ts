const HEXTET = /^[0-9a-f]{1,4}$/i;
const IPV4_OCTET = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function invalid(ip: string): Error {
  return new Error(`Invalid IPv6: ${ip}`);
}

/** A dotted IPv4 tail as its two hextets, or null when it is not one. */
function ipv4Hextets(tail: string): [string, string] | null {
  const octets = tail.split(".");
  if (octets.length !== 4 || !octets.every((o) => IPV4_OCTET.test(o))) {
    return null;
  }
  const hex = octets.map((o) => Number(o).toString(16).padStart(2, "0"));
  return [`${hex[0]}${hex[1]}`, `${hex[2]}${hex[3]}`];
}

/** The groups of one side of `::`, a dotted IPv4 tail (allowed last only) counted as two. */
function groups(side: string, ip: string, last: boolean): string[] {
  if (side === "") return [];
  const raw = side.split(":");
  const tail = raw.at(-1) ?? "";
  if (tail.includes(".")) {
    const pair = last ? ipv4Hextets(tail) : null;
    if (pair === null) throw invalid(ip);
    raw.splice(-1, 1, ...pair);
  }
  if (!raw.every((g) => HEXTET.test(g))) throw invalid(ip);
  return raw;
}

/**
 * Expand any valid IPv6 spelling to eight zero-padded lowercase hextets, an embedded dotted
 * IPv4 tail included (`::ffff:192.0.2.1` -> `...:ffff:c000:0201`); throws on a malformed one
 * (a bad or overlong group, a wrong group count, `::` twice or standing for no group).
 */
export function expandIpv6(ip: string): string {
  const sides = ip.split("::");
  if (sides.length > 2) throw invalid(ip);
  let full: string[];
  if (sides.length === 1) {
    full = groups(ip, ip, true);
    if (full.length !== 8) throw invalid(ip);
  } else {
    const head = groups(sides[0] ?? "", ip, false);
    const tail = groups(sides[1] ?? "", ip, true);
    const missing = 8 - head.length - tail.length;
    if (missing < 1) throw invalid(ip);
    full = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  }
  return full.map((h) => h.toLowerCase().padStart(4, "0")).join(":");
}

function stripIpv6Hextets(parts: string[]): string[] {
  return parts.map((h) => {
    const trimmed = h.replace(/^0+/, "");
    return trimmed === "" ? "0" : trimmed;
  });
}

/** RFC 5952 compressed lowercase IPv6 (input may be any valid spelling; browser-safe, no node:net). */
export function compressIpv6(ip: string): string {
  const parts = stripIpv6Hextets(expandIpv6(ip).split(":"));
  // RFC 5952 §5: an IPv4-mapped address keeps its dotted tail.
  if (parts.slice(0, 5).every((h) => h === "0") && parts[5] === "ffff") {
    const hex = `${(parts[6] ?? "0").padStart(4, "0")}${(parts[7] ?? "0").padStart(4, "0")}`;
    const octets = [0, 2, 4, 6].map((i) =>
      Number.parseInt(hex.slice(i, i + 2), 16)
    );
    return `::ffff:${octets.join(".")}`;
  }

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
