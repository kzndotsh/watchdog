import { identifierTypeEntry } from "./identifier-types";
import type { IdentifierType } from "./vocab";

function normalizeIdentifierOnce(
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- IdentifierType kept for docs/autocomplete; callers may also pass unvalidated raw JSON `type` values
  type: IdentifierType | string,
  value: string
): string {
  const raw = value.trim();
  if (!raw) return raw;
  return identifierTypeEntry(type)?.canonicalize?.(raw) ?? raw;
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
