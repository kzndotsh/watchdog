import { proposalPatch } from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { normalizeUuidList, type PatchOp } from "@watchdog/schemas";

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
  if (
    op.resource === "claim" ||
    op.resource === "identifier" ||
    op.resource === "edge"
  ) {
    return normalizeUuidList(sharedEvidenceIds);
  }
  return [];
}
