import type { ProposalRecord } from "@/domains/triage/triage.functions";
import {
  PROPOSAL_STATUS_OPTIONS,
  capabilityLabel,
  PATCH_RESOURCE_META,
  playbookLabel,
  proposalHeadlineLabel,
  statusLabel,
} from "@/shared/ui/vocab";
import {
  catalogIdMatchesSearch,
  patchOpHeadline,
  patchOpSearchText,
  proposalEntityName as coreProposalEntityName,
  proposalEntitySlug as coreProposalEntitySlug,
  slugifyName,
  type PatchOp,
  type ProposalStatus,
} from "@watchdog/schemas";

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

/** Map queue filters to `?status=` — pending-only omits the param (default view). */
export function triageStatusSearchParam(
  filters: TriageQueueFilters
): ProposalStatus | undefined {
  if (isTriagePendingOnlyFilters(filters)) return undefined;
  if (filters.statuses.length === 1) return filters.statuses[0];
  return undefined;
}

/** Seed status facet from validated search — absent means pending-only. */
export function triageStatusesFromSearch(
  status?: ProposalStatus
): ProposalStatus[] {
  if (status) return [status];
  return PENDING_TRIAGE_FILTERS.statuses;
}

export const STATUS_FACET_OPTIONS = PROPOSAL_STATUS_OPTIONS;

export function proposalPatch(row: ProposalRecord): PatchOp[] {
  return row.patch ?? [];
}

function proposalDisplayOpts(row: ProposalRecord) {
  return {
    patch: proposalPatch(row),
    entityNames: row.entityNames,
    entitySlugs: row.entitySlugs,
  };
}

/** Entity display label from patch ops that cite an entity. */
export function proposalEntityName(row: ProposalRecord): string | null {
  return coreProposalEntityName(proposalDisplayOpts(row));
}

/** Dossier slug for the header entity, when known. */
export function proposalEntitySlug(row: ProposalRecord): string | null {
  return coreProposalEntitySlug(proposalDisplayOpts(row));
}

/** Short title for a proposal row / Detail header. */
export function proposalTitle(row: ProposalRecord): string {
  const headline = proposalHeadlineLabel({
    summary: row.summary,
    capabilityId: row.capabilityId,
    playbookId: row.playbookId,
    entityName: proposalEntityName(row),
  });
  if (headline !== "") return headline;
  const patch = proposalPatch(row);
  if (!patch.length) return "Proposal";

  const first = patch[0];
  return first ? patchOpHeadline(first) : "Proposal";
}

/** Compact “2 Claims, 1 Connection” summary of patch ops. */
function patchResourceCountLabel(
  resource: PatchOp["resource"],
  count: number
): string {
  const label = PATCH_RESOURCE_META[resource].label;
  if (count === 1) return label;
  if (resource === "entity") return "Entities";
  return `${label}s`;
}

function isPatchResource(resource: string): resource is PatchOp["resource"] {
  return resource in PATCH_RESOURCE_META;
}

export function opLabel(patch: ProposalRecord["patch"]): string {
  const counts: Partial<Record<PatchOp["resource"], number>> = {};
  for (const op of patch ?? []) {
    counts[op.resource] = (counts[op.resource] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([resource, count]) => {
      if (!isPatchResource(resource)) return "";
      return `${count} ${patchResourceCountLabel(resource, count)}`;
    })
    .filter((line) => line !== "")
    .join(", ");
}

/** Lowercase haystack from patch op bodies (claim text, identifier values, …). */
function patchSearchHaystack(patch: ProposalRecord["patch"]): string {
  return (patch ?? [])
    .map((op) => patchOpSearchText(op))
    .join(" ")
    .toLowerCase();
}

/** Lowercase haystack from cited entity summary/notes maps. */
function entityTextHaystack(
  summaries: Record<string, string> | undefined,
  notes: Record<string, string> | undefined
): string {
  const parts: string[] = [];
  for (const value of Object.values(summaries ?? {})) {
    const trimmed = value.trim();
    if (trimmed !== "") parts.push(trimmed);
  }
  for (const value of Object.values(notes ?? {})) {
    const trimmed = value.trim();
    if (trimmed !== "") parts.push(trimmed);
  }
  return parts.join(" ").toLowerCase();
}

export function filterTriageQueue(
  proposals: ProposalRecord[],
  filters: TriageQueueFilters
): ProposalRecord[] {
  let out = proposals;
  if (filters.statuses.length > 0) {
    const statuses = new Set(filters.statuses);
    out = out.filter((p) => statuses.has(p.status));
  }
  if (filters.q.trim()) {
    const q = filters.q.toLowerCase().trim();
    const slugQ = slugifyName(filters.q);
    out = out.filter((p) => {
      const summary = (p.summary ?? "").toLowerCase();
      const cap = (p.capabilityId ?? "").toLowerCase();
      const capLabel = capabilityLabel(p.capabilityId ?? "").toLowerCase();
      const capHaystack = catalogIdMatchesSearch(p.capabilityId, q);
      const playbook = (p.playbookId ?? "").toLowerCase();
      const playbookHaystack = catalogIdMatchesSearch(p.playbookId, q);
      const playbookLabelStr = p.playbookId
        ? playbookLabel(p.playbookId).toLowerCase()
        : "";
      const ops = opLabel(proposalPatch(p)).toLowerCase();
      const patchOps = proposalPatch(p);
      const opResources = patchOps
        .map((op) => op.resource)
        .join(" ")
        .toLowerCase();
      const entityName = (proposalEntityName(p) ?? "").toLowerCase();
      const entitySlug = (proposalEntitySlug(p) ?? "").toLowerCase();
      const entityText = entityTextHaystack(p.entitySummaries, p.entityNotes);
      const title = proposalTitle(p).toLowerCase();
      const patchBody = patchSearchHaystack(patchOps);
      const status = p.status.toLowerCase();
      const statusLabelStr = statusLabel(p.status).toLowerCase();
      const rejectReason = (p.rejectReason ?? "").toLowerCase();
      const createdBy = (p.createdByLabel ?? "").toLowerCase();
      const decidedBy = (p.decidedByLabel ?? "").toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        summary.includes(q) ||
        cap.includes(q) ||
        capHaystack ||
        capLabel.includes(q) ||
        playbook.includes(q) ||
        playbookHaystack ||
        playbookLabelStr.includes(q) ||
        ops.includes(q) ||
        opResources.includes(q) ||
        entityName.includes(q) ||
        entitySlug.includes(q) ||
        (slugQ !== "" && entitySlug.includes(slugQ)) ||
        entityText.includes(q) ||
        title.includes(q) ||
        patchBody.includes(q) ||
        status.includes(q) ||
        statusLabelStr.includes(q) ||
        rejectReason.includes(q) ||
        createdBy.includes(q) ||
        decidedBy.includes(q) ||
        (p.jobId ?? "").toLowerCase().includes(q)
      );
    });
  }
  return out;
}
