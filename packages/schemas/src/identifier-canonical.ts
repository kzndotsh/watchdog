import { compressIpv6 } from "./ip";

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

/** Trim and strip a surrounding `[...]` pair until stable, so a second pass is a no-op; a lone bracket stays. */
function stripIpBrackets(raw: string): string {
  let value = raw.trim();
  while (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function normalizeIpValue(raw: string): string {
  const trimmed = stripIpBrackets(raw);
  if (trimmed.includes(":")) {
    const lower = trimmed.toLowerCase();
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
 * Drop everything from the first `/` that has no line terminator after it.
 * Linear replacement for `.replace(/\/.*$/, "")`, which backtracked
 * quadratically on long runs of `/` (CodeQL js/polynomial-redos); same output,
 * since `.` never matches a line terminator.
 */
function cutPathSegment(value: string): string {
  let lastBreak = -1;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const c = value.codePointAt(i);
    if (c === 10 || c === 13 || c === 0x20_28 || c === 0x20_29) {
      lastBreak = i;
      break;
    }
  }
  const slash = value.indexOf("/", lastBreak + 1);
  return slash === -1 ? value : value.slice(0, slash);
}

/** Email: lowercase. */
export function canonicalizeEmail(raw: string): string {
  return raw.toLowerCase();
}

/** Phone: digits, a leading `+` preserved. */
export function canonicalizePhone(raw: string): string {
  const digits = raw.replaceAll(/\D/g, "");
  return raw.startsWith("+") ? `+${digits}` : digits;
}

export const canonicalizeUrl = normalizeUrlValue;
export const canonicalizeIp = normalizeIpValue;

/** Domain: lowercase host, scheme, path, trailing dot and leading `*.` dropped. */
export function canonicalizeDomain(raw: string): string {
  return cutPathSegment(raw.toLowerCase().replace(/^https?:\/\//, ""))
    .replace(/\.$/, "")
    .replace(/^\*\./, "");
}

/** PGP: key id (16) or fingerprint (40+) hex loses spaces/colons and is uppercased; armor stays as written. */
export function canonicalizePgp(raw: string): string {
  const compact = raw.replaceAll(/[\s:]+/g, "");
  return /^[0-9a-fA-F]{16,}$/.test(compact) ? compact.toUpperCase() : raw;
}
