import { PATCH_RESOURCE_META, proposalHeadlineLabel } from "@/shared/ui/vocab";
import type {
  ProposalQueueItem,
  ProposalRecord,
} from "@watchdog/core/proposals";
import { patchOpHeadline, type PatchOp } from "@watchdog/schemas/graph";
import {
  proposalEntityName as coreProposalEntityName,
  proposalEntitySlug as coreProposalEntitySlug,
} from "@watchdog/schemas/jobs";

/**
 * What the headline needs of a Proposal: a queue row (no patch, so no Entity name to fall back on)
 * or the full record.
 */
export type ProposalTitleSource = Pick<
  ProposalQueueItem,
  "summary" | "capabilityId" | "playbookId"
> &
  Partial<Pick<ProposalRecord, "patch" | "entityNames" | "entitySlugs">>;

export function proposalPatch(
  row: Partial<Pick<ProposalRecord, "patch">>
): PatchOp[] {
  return row.patch ?? [];
}

function proposalDisplayOpts(row: ProposalTitleSource) {
  return {
    patch: proposalPatch(row),
    entityNames: row.entityNames,
    entitySlugs: row.entitySlugs,
  };
}

/** Entity display label from patch ops that cite an entity. */
export function proposalEntityName(row: ProposalTitleSource): string | null {
  return coreProposalEntityName(proposalDisplayOpts(row));
}

/** Dossier slug for the header entity, when known. */
export function proposalEntitySlug(row: ProposalTitleSource): string | null {
  return coreProposalEntitySlug(proposalDisplayOpts(row));
}

/** Short title for a proposal row / Detail header. */
export function proposalTitle(row: ProposalTitleSource): string {
  const headline = proposalHeadlineLabel({
    summary: row.summary,
    capabilityId: row.capabilityId,
    playbookId: row.playbookId,
    entityName: proposalEntityName(row),
  });
  if (headline !== "") return headline;
  const first = proposalPatch(row)[0];
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

/** "2 Claims, 1 Connection" from a Proposal's op counts (a queue row's). */
export function opLabel(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts)
    .map(([resource, count]) => {
      if (!isPatchResource(resource)) return "";
      return `${count} ${patchResourceCountLabel(resource, count)}`;
    })
    .filter((line) => line !== "")
    .join(", ");
}
