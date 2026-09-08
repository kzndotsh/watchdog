import type { PatchOp } from "@watchdog/schemas";
import {
  capabilityIdLabel,
  patchOpHeadline,
  playbookIdLabel,
  proposalEntityName,
} from "@watchdog/schemas";

export {
  proposalEntityId,
  proposalEntityName,
  proposalEntitySlug,
} from "@watchdog/schemas";

/** Playbook or capability label for a proposal (no summary / entity). */
export function proposalSourceLabel(opts: {
  capabilityId: string | null;
  playbookId?: string | null;
}): string {
  if (opts.playbookId) return playbookIdLabel(opts.playbookId);
  return capabilityIdLabel(opts.capabilityId);
}

export function proposalActivityLabel(opts: {
  summary: string | null;
  capabilityId: string | null;
  playbookId?: string | null;
  patch: PatchOp[];
  entityNames?: Record<string, string>;
  entitySlugs?: Record<string, string>;
}): string {
  const summary = opts.summary?.trim();
  if (summary !== undefined && summary !== "") return summary;

  const entityName = proposalEntityName(opts);
  const cap = proposalSourceLabel(opts);

  if (cap && entityName) return `${cap} · ${entityName}`;
  if (cap) return cap;
  if (entityName) return entityName;

  if (!opts.patch.length) return "Proposal pending";

  const first = opts.patch[0];
  return first ? patchOpHeadline(first) : "Proposal pending";
}
