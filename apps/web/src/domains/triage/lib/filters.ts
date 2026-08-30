import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { PROPOSAL_STATUS_OPTIONS, capabilityLabel } from "@/shared/ui/vocab";
import type { ProposalStatus } from "@watchdog/schemas";
import { patchOpEntityId } from "@watchdog/schemas";

export interface TriageQueueFilters {
  q: string;
  /** Empty = all statuses (same contract as Jobs). */
  statuses: ProposalStatus[];
}

/** No facets / search — show every proposal (clear-filters). */
export const EMPTY_TRIAGE_FILTERS: TriageQueueFilters = {
  q: "",
  statuses: [],
};

/** Pending-only — first paint and after accept/reject / new proposal. */
export const PENDING_TRIAGE_FILTERS: TriageQueueFilters = {
  q: "",
  statuses: ["pending"],
};

/** Pending-only facet — empty queue here is “cleared”, not “no results”. */
export function isTriagePendingOnlyFilters(
  filters: TriageQueueFilters
): boolean {
  return (
    !filters.q.trim() &&
    filters.statuses.length === 1 &&
    filters.statuses[0] === "pending"
  );
}

export const STATUS_FACET_OPTIONS = PROPOSAL_STATUS_OPTIONS;

/** Entity id from the first patch op that cites an entityId. */
export function proposalEntityId(row: ProposalRecord): string | null {
  const entityId = row.patch
    .map((op) => patchOpEntityId(op))
    .find((id): id is string => id !== undefined);
  return entityId ?? null;
}

/** Entity display name from the first patch op that cites an entityId. */
export function proposalEntityName(row: ProposalRecord): string | null {
  const entityId = proposalEntityId(row);
  if (!entityId) return null;
  const name = row.entityNames?.[entityId];
  return name !== undefined && name !== "" ? name : null;
}

/** Dossier slug for the header entity, when known. */
export function proposalEntitySlug(row: ProposalRecord): string | null {
  const entityId = proposalEntityId(row);
  if (!entityId) return null;
  const slug = row.entitySlugs?.[entityId];
  return slug !== undefined && slug !== "" ? slug : null;
}

/** Short title for a proposal row / Detail header. */
export function proposalTitle(row: ProposalRecord): string {
  const entityName = proposalEntityName(row);
  const cap = capabilityLabel(row.capabilityId) || null;

  if (cap && entityName) return `${cap} · ${entityName}`;
  if (cap) return cap;
  if (entityName) return entityName;
  if (!row.patch.length) return "Proposal";

  const first = row.patch[0];
  return first ? `${first.op} ${first.resource}` : "Proposal";
}

/** Compact “2 claims, 1 edge” summary of patch ops. */
export function opLabel(patch: ProposalRecord["patch"]): string {
  const counts: Record<string, number> = {};
  for (const op of patch) {
    counts[op.resource] = (counts[op.resource] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([r, n]) => `${n} ${r}${n > 1 ? "s" : ""}`)
    .join(", ");
}

export function filterTriageQueue(
  proposals: ProposalRecord[],
  filters: TriageQueueFilters
): ProposalRecord[] {
  let out = proposals;
  if (filters.statuses.length > 0) {
    out = out.filter((p) => filters.statuses.includes(p.status));
  }
  if (filters.q.trim()) {
    const q = filters.q.toLowerCase().trim();
    out = out.filter((p) => {
      const summary = (p.summary ?? "").toLowerCase();
      const cap = (p.capabilityId ?? "").toLowerCase();
      const ops = opLabel(p.patch).toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        summary.includes(q) ||
        cap.includes(q) ||
        ops.includes(q) ||
        (p.jobId ?? "").toLowerCase().includes(q)
      );
    });
  }
  return out;
}
