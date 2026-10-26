import { PATCH_RESOURCE_META, proposalHeadlineLabel } from "@/shared/ui/vocab";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { patchOpHeadline, type PatchOp } from "@watchdog/schemas/graph";
import {
  proposalEntityName as coreProposalEntityName,
  proposalEntitySlug as coreProposalEntitySlug,
} from "@watchdog/schemas/jobs";

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
