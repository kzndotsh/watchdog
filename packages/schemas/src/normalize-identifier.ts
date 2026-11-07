import { compressIpv6 } from "./ip";
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

function ipv6HasInvalidCompression(value: string): boolean {
  return (value.match(/::/g) ?? []).length > 1 || value.includes(":::");
}

/** Trim and strip surrounding [brackets] until stable, so a second pass is a no-op. */
function stripIpBrackets(raw: string): string {
  let value = raw.trim();
  for (;;) {
    const next = value.replace(/^\[/, "").replace(/\]$/, "").trim();
    if (next === value) return value;
    value = next;
  }
}

function normalizeIpValue(raw: string): string {
  const trimmed = stripIpBrackets(raw);
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

function normalizeIdentifierOnce(
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
      return cutPathSegment(raw.toLowerCase().replace(/^https?:\/\//, ""))
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
    default: {
      return raw;
    }
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
/** Each pass strictly normalizes or leaves the value alone; this bound only guards against a non-converging rule. */
const MAX_NORMALIZE_PASSES = 16;

export function normalizeIdentifierValue(
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- IdentifierType kept for docs/autocomplete; callers may also pass unvalidated raw JSON `type` values
  type: IdentifierType | string,
  value: string
): string {
  // Normalization must be idempotent (identity matching and dedupe compare
  // normalized values), and a single pass is not: stripping a bracket or a
  // path can expose new whitespace. Iterate to a fixed point.
  let current = normalizeIdentifierOnce(type, value);
  for (let pass = 1; pass < MAX_NORMALIZE_PASSES; pass += 1) {
    const next = normalizeIdentifierOnce(type, current);
    if (next === current) return current;
    current = next;
  }
  return current;
}
