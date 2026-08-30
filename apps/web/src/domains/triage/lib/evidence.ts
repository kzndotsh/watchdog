import type { EvidenceRecord } from "@/domains/intake/types";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { formatOpaqueId } from "@/shared/ui/format-opaque-id";
import type { PatchOp } from "@watchdog/schemas";

export function evidenceLabel(row: EvidenceRecord): string {
  if (row.label?.trim()) return row.label.trim();
  if (row.sourceUrl?.trim()) return row.sourceUrl.trim();
  if (row.sha256) return `${row.kind} · ${formatOpaqueId(row.sha256, 8)}`;
  return `${row.kind} · ${formatOpaqueId(row.id, 8)}`;
}

/** All evidence ids on the proposal + per-op links. */
export function collectProposalEvidenceIds(proposal: ProposalRecord): string[] {
  const ids = new Set(proposal.evidenceIds);
  for (const op of proposal.patch) {
    for (const id of op.evidenceIds ?? []) ids.add(id);
  }
  return [...ids];
}

/**
 * Prefer op-local links; for claim/identifier/edge fall back to proposal
 * shared evidence (what accept will attach).
 */
export function evidenceIdsForOp(
  op: PatchOp,
  sharedEvidenceIds: string[]
): string[] {
  const own = op.evidenceIds ?? [];
  if (own.length > 0) return own;
  if (
    op.resource === "claim" ||
    op.resource === "identifier" ||
    op.resource === "edge"
  ) {
    return sharedEvidenceIds;
  }
  return [];
}
