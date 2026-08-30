import type { CollectFilters, CollectRow } from "@/domains/collect/types";
import { resolveQueueSelection } from "@/shared/lib/queue-selection";

function rowIsUnattached(row: CollectRow): boolean {
  return (
    row.evidence !== null && (row.entityId === null || row.entityId === "")
  );
}

function rowIsUnprocessed(row: CollectRow): boolean {
  return row.evidence !== null && row.evidence.processedAt === null;
}

export function filterCollectRows(
  rows: readonly CollectRow[],
  filters: CollectFilters
): CollectRow[] {
  let out = [...rows];
  out = out.filter((row) =>
    filters.hiddenOnly ? row.state === "hidden" : row.state !== "hidden"
  );
  if (filters.states.length > 0) {
    out = out.filter((row) => filters.states.includes(row.state));
  }
  if (filters.unprocessedOnly) {
    out = out.filter(rowIsUnprocessed);
  }
  if (filters.unattachedOnly) {
    out = out.filter(rowIsUnattached);
  }
  if (filters.capabilityIds.length > 0) {
    out = out.filter((row) =>
      row.runs.some((run) =>
        filters.capabilityIds.includes(run.job.capabilityId)
      )
    );
  }
  if (filters.q.trim()) {
    const q = filters.q.toLowerCase().trim();
    out = out.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        (row.hint ?? "").toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.runs.some((run) => run.job.capabilityId.toLowerCase().includes(q))
    );
  }
  return out;
}

export function isCollectFiltered(filters: CollectFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.states.length > 0 ||
    filters.hiddenOnly ||
    filters.unprocessedOnly ||
    filters.unattachedOnly ||
    filters.capabilityIds.length > 0
  );
}

export interface CollectSelection {
  readonly rowId: string | null;
  readonly focusRunId: string | null;
}

export function resolveCollectSelection(
  urlId: string | undefined,
  rowById: (id: string) => CollectRow | null,
  visibleRows: readonly CollectRow[],
  opts?: { readonly holdMissingId?: boolean }
): CollectSelection {
  const visibleIds = visibleRows.map((row) => row.id);
  const resolvedId = resolveQueueSelection(
    urlId,
    visibleIds.map((id) => ({ id })),
    {
      holdMissingUrlId: opts?.holdMissingId,
    }
  );
  if (resolvedId === null) {
    return { rowId: null, focusRunId: null };
  }
  const row = rowById(resolvedId);
  if (row === null) {
    if (opts?.holdMissingId && urlId !== undefined) {
      return { rowId: urlId, focusRunId: urlId };
    }
    return { rowId: resolvedId, focusRunId: null };
  }
  const focusRunId =
    urlId !== undefined &&
    urlId !== row.id &&
    row.runs.some((run) => run.job.id === urlId)
      ? urlId
      : null;
  return { rowId: row.id, focusRunId };
}
