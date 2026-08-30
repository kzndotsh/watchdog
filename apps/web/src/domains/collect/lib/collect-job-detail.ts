import type { CollectRow } from "@/domains/collect/types";

/** Job id whose detail `CollectDetail` loads when the row is job-only (no evidence). */
export function resolveCollectJobDetailId(
  row: CollectRow | null,
  focusRunId: string | null
): string | null {
  if (row === null || row.evidence !== null) return null;
  return focusRunId ?? row.runs[0]?.job.id ?? null;
}
