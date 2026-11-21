import type { FoundValueRecord } from "@watchdog/domain/schemas/jobs";
import {
  IDENTIFIER_TYPE_LABELS,
  type IdentifierType,
} from "@watchdog/domain/schemas/shared";

/** A type group of the Found tab: "Domain (213)". */
export type FoundValueGroup = {
  type: IdentifierType;
  label: string;
  values: FoundValueRecord[];
  /** Values in the group that some Entity of the Case already holds. */
  heldCount: number;
};

/** True when `q` (trimmed, case-insensitive) is in the value or one of its sources. */
function matches(row: FoundValueRecord, q: string): boolean {
  if (q === "") return true;
  return (
    row.value.toLowerCase().includes(q) ||
    row.sources.some((source) => source.toLowerCase().includes(q))
  );
}

/**
 * The Found tab's groups: one per Identifier type, in the order the report first names each, with
 * the values that match `q`. A group with no match is left out.
 */
export function groupFoundValues(
  values: readonly FoundValueRecord[],
  q: string
): FoundValueGroup[] {
  const needle = q.trim().toLowerCase();
  const byType = new Map<IdentifierType, FoundValueRecord[]>();
  for (const row of values) {
    if (!matches(row, needle)) continue;
    const group = byType.get(row.type);
    if (group === undefined) byType.set(row.type, [row]);
    else group.push(row);
  }
  return [...byType].map(([type, rows]) => ({
    type,
    label: IDENTIFIER_TYPE_LABELS[type],
    values: rows,
    heldCount: rows.filter((row) => row.onEntities.length > 0).length,
  }));
}
