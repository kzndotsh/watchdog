import type { IdentifierType } from "./vocab";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

function expandIpv6(ip: string): string {
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

/** RFC 5952-style compressed lowercase IPv6 (schemas-local; no node:net / tools). */
function compressIpv6(ip: string): string {
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

function ipv6HasInvalidCompression(value: string): boolean {
  return (value.match(/::/g) ?? []).length > 1 || value.includes(":::");
}

function normalizeIpValue(raw: string): string {
  const trimmed = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (trimmed.includes(":")) {
    const lower = trimmed.toLowerCase();
    if (ipv6HasInvalidCompression(lower)) {
      return lower;
    }
    try {
      return compressIpv6(lower);
    } catch {
      return lower;
    }
  }
  return trimmed;
}

function normalizeUrlValue(raw: string): string {
  let candidate = raw;
  if (
    !/^https?:\/\//i.test(candidate) &&
    /^[\w.-]+\.[a-z]{2,}/i.test(candidate)
  ) {
    candidate = `https://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const kept = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.append(k, v);
    }
    url.search = kept.toString() ? `?${kept.toString()}` : "";
    // Prefer bare hostname form when no path/query beyond /
    let out = url.toString();
    if (out.endsWith("/") && url.pathname === "/" && !url.search) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Canonicalize identifier values for storage / unique-index stability.
 * - email / url hosts → lowercase
 * - phone → digits (+ leading + preserved when present)
 * - url → strip hash + common tracking params
 * - pgp fingerprints → strip spaces/colons, uppercase hex (armored keys stay trimmed)
 * - domain → lowercase host (strip scheme/path)
 * - ip → trim, strip [brackets], lowercase + RFC 5952-compress IPv6
 * - handle / credential / crypto / other → trimmed as written
 */
export function normalizeIdentifierValue(
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- IdentifierType kept for docs/autocomplete; callers may also pass unvalidated raw JSON `type` values
  type: IdentifierType | string,
  value: string
): string {
  const raw = value.trim();
  if (!raw) return raw;

  switch (type) {
    case "email": {
      return raw.toLowerCase();
    }
    case "phone": {
      const hasPlus = raw.startsWith("+");
      const digits = raw.replaceAll(/\D/g, "");
      return hasPlus ? `+${digits}` : digits;
    }
    case "url": {
      return normalizeUrlValue(raw);
    }
    case "domain": {
      return raw
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/\.$/, "")
        .replace(/^\*\./, "");
    }
    case "pgp": {
      const compact = raw.replaceAll(/[\s:]+/g, "");
      // Key id (16) or fingerprint (40+) hex — canonicalize casing/separators.
      if (/^[0-9a-fA-F]{16,}$/.test(compact)) {
        return compact.toUpperCase();
      }
      return raw;
    }
    case "ip": {
      return normalizeIpValue(raw);
    }
    case "handle":
    case "credential":
    case "crypto":
    case "other": {
      return raw;
    }
    default: {
      return raw;
    }
  }
}
