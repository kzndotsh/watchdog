import type { CollectRow, CollectFilters } from "@/domains/collect/types";
import { COLLECT_STATE_FACET_OPTIONS } from "@/domains/collect/types";
import type { CollectState, EvidenceRecord } from "@/domains/intake/types";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { resolveQueueSelection } from "@/shared/lib/queue-selection";
import { evidenceFilterHaystack } from "@/shared/ui/intake/evidence-option";
import { capabilityLabel, playbookLabel, statusLabel } from "@/shared/ui/vocab";
import {
  catalogIdMatchesSearch,
  evidenceIdsFromJobInputs,
  parseOptionalTrimmedUuid,
  slugifyName,
  summarizeJobInput,
} from "@watchdog/schemas";

/** Align queue facets with API evidence list mutual-exclusion rules. */
export function applyCollectFilterToggle(
  filters: CollectFilters,
  key: "hiddenOnly" | "unprocessedOnly" | "unattachedOnly",
  enabled: boolean
): CollectFilters {
  if (!enabled) {
    return { ...filters, [key]: false };
  }
  if (key === "hiddenOnly") {
    return {
      ...filters,
      hiddenOnly: true,
      unprocessedOnly: false,
      unattachedOnly: false,
      states: [],
      capabilityIds: [],
    };
  }
  return {
    ...filters,
    hiddenOnly: false,
    [key]: true,
  };
}

export function evidenceSearchHaystackFromRecord(
  evidence: Pick<
    EvidenceRecord,
    "label" | "notes" | "sourceUrl" | "text" | "kind" | "mime" | "sha256"
  >
): string {
  return evidenceFilterHaystack(evidence);
}

export function evidenceSearchHaystackByIdFromRecords(
  rows: readonly EvidenceRecord[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, evidenceSearchHaystackFromRecord(row));
  }
  return map;
}

function rowIsUnattached(row: CollectRow): boolean {
  return (
    row.evidence !== null &&
    parseOptionalTrimmedUuid(row.entityId) === undefined
  );
}

function rowIsUnprocessed(row: CollectRow): boolean {
  return row.evidence !== null && row.evidence.processedAt === null;
}

function collectStateSearchHaystack(state: CollectState): string {
  if (state === "hidden") return "hidden";
  const label =
    COLLECT_STATE_FACET_OPTIONS.find((opt) => opt.value === state)?.label ??
    state;
  return `${state} ${label}`.toLowerCase();
}

function collectEvidenceHaystack(row: CollectRow): string {
  if (row.evidence === null) return "";
  return evidenceSearchHaystackFromRecord(row.evidence);
}

function referencedEvidenceHaystack(
  row: CollectRow,
  evidenceSearchById?: ReadonlyMap<string, string>
): string {
  if (evidenceSearchById === undefined || row.runs.length === 0) return "";
  const parts: string[] = [];
  for (const run of row.runs) {
    for (const id of evidenceIdsFromJobInputs([run.job.input])) {
      const haystack = evidenceSearchById.get(id);
      if (haystack !== undefined && haystack !== "") {
        parts.push(haystack);
      }
    }
  }
  return parts.join(" ");
}

export function filterCollectRows(
  rows: readonly CollectRow[],
  filters: CollectFilters,
  opts?: {
    entityLabelById?: ReadonlyMap<string, string>;
    entityTitleById?: ReadonlyMap<string, string>;
    evidenceTitleById?: ReadonlyMap<string, string>;
    evidenceSearchById?: ReadonlyMap<string, string>;
  }
): CollectRow[] {
  let out = [...rows];
  out = out.filter((row) =>
    filters.hiddenOnly ? row.state === "hidden" : row.state !== "hidden"
  );
  if (filters.states.length > 0) {
    const states = new Set(filters.states);
    out = out.filter((row) => states.has(row.state));
  }
  // Align with API evidence list: hiddenOnly is mutually exclusive with queue facets.
  if (!filters.hiddenOnly && filters.unprocessedOnly) {
    out = out.filter(rowIsUnprocessed);
  }
  if (!filters.hiddenOnly && filters.unattachedOnly) {
    out = out.filter(rowIsUnattached);
  }
  if (filters.capabilityIds.length > 0) {
    const capabilityIds = new Set(filters.capabilityIds);
    out = out.filter((row) =>
      row.runs.some((run) => {
        const job = run.job;
        return (
          capabilityIds.has(job.capabilityId) ||
          (job.playbookId !== null && capabilityIds.has(job.playbookId))
        );
      })
    );
  }
  if (filters.q.trim()) {
    const q = filters.q.toLowerCase().trim();
    const slugQ = slugifyName(filters.q);
    out = out.filter((row) => {
      const scopedEntityId = parseOptionalTrimmedUuid(row.entityId);
      const entityLabel =
        scopedEntityId === undefined
          ? ""
          : (opts?.entityLabelById?.get(scopedEntityId) ?? "").toLowerCase();
      return (
        row.title.toLowerCase().includes(q) ||
        (row.hint ?? "").toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        collectStateSearchHaystack(row.state).includes(q) ||
        entityLabel.includes(q) ||
        (slugQ !== "" && entityLabel.includes(slugQ)) ||
        collectEvidenceHaystack(row).includes(q) ||
        referencedEvidenceHaystack(row, opts?.evidenceSearchById).includes(q) ||
        row.runs.some((run) => {
          const job = run.job;
          return (
            catalogIdMatchesSearch(job.capabilityId, q) ||
            capabilityLabel(job.capabilityId).toLowerCase().includes(q) ||
            job.status.toLowerCase().includes(q) ||
            statusLabel(job.status).toLowerCase().includes(q) ||
            summarizeJobInput(
              job.input,
              opts?.evidenceTitleById,
              opts?.entityTitleById ?? opts?.entityLabelById
            )
              .toLowerCase()
              .includes(q) ||
            (job.resultSummary ?? "").toLowerCase().includes(q) ||
            (job.error ?? "").toLowerCase().includes(q) ||
            (job.interpretError ?? "").toLowerCase().includes(q) ||
            (job.playbookId !== null &&
              catalogIdMatchesSearch(job.playbookId, q)) ||
            (job.playbookId !== null &&
              playbookLabel(job.playbookId).toLowerCase().includes(q))
          );
        })
      );
    });
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
  const normalizedUrlId = scopeOptionalUuid(urlId);
  const visibleIds = visibleRows.map((row) => row.id);
  const resolvedId = resolveQueueSelection(
    normalizedUrlId,
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
    if (opts?.holdMissingId && normalizedUrlId !== undefined) {
      return { rowId: normalizedUrlId, focusRunId: normalizedUrlId };
    }
    return { rowId: resolvedId, focusRunId: null };
  }
  const focusRunId =
    normalizedUrlId !== undefined &&
    normalizedUrlId !== row.id &&
    row.runs.some((run) => run.job.id === normalizedUrlId)
      ? normalizedUrlId
      : null;
  return { rowId: row.id, focusRunId };
}
