import type { FoundValue } from "@watchdog/schemas/jobs";
import type { IdentifierType } from "@watchdog/schemas/shared";

import { validatedIdentifierValue } from "./validated-identifier-value";

/**
 * A `found` reader's values of one type from one place in the report: each normalized and
 * validated the way an Identifier write is (an invalid one is dropped), deduped, in report
 * order. No limit: a reader returns everything the report holds.
 */
export function foundOfType(
  type: IdentifierType,
  raws: readonly (string | null | undefined)[],
  source: string
): FoundValue[] {
  const seen = new Set<string>();
  const out: FoundValue[] = [];
  for (const raw of raws) {
    if (raw === null || raw === undefined || raw.trim() === "") continue;
    const value = validatedIdentifierValue(type, raw);
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    out.push({ type, value, source });
  }
  return out;
}
