import { proposalPatch } from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@watchdog/core/proposals";
import {
  CONFIDENCE_GATED_RESOURCES,
  patchOpResource,
  type PatchOp,
} from "@watchdog/domain/schemas/graph";
import { normalizeUuidList } from "@watchdog/domain/schemas/shared";

export { evidenceLabel } from "@/shared/ui/intake/evidence-option";

/** All evidence ids on the proposal + per-op links. */
export function collectProposalEvidenceIds(proposal: ProposalRecord): string[] {
  const raw = [...proposal.evidenceIds];
  for (const op of proposalPatch(proposal)) {
    raw.push(...(op.evidenceIds ?? []));
  }
  return normalizeUuidList(raw);
}

/**
 * Prefer op-local links; for claim/identifier/edge fall back to proposal
 * shared evidence (what accept will attach).
 */
export function evidenceIdsForOp(
  op: PatchOp,
  sharedEvidenceIds: string[]
): string[] {
  const own = normalizeUuidList(op.evidenceIds ?? []);
  if (own.length > 0) return own;
  if (CONFIDENCE_GATED_RESOURCES.has(patchOpResource(op))) {
    return normalizeUuidList(sharedEvidenceIds);
  }
  return [];
}
