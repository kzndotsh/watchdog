import { Data, Effect } from "effect";

import type { PatchOp } from "#schemas/graph";
import { parseGraphUuidList, type ConfidenceTier } from "#schemas/shared";

import { confirmedEvidenceViolation } from "./confirmed-evidence";
import { patchNeedsConfidence } from "./patch-needs-confidence";

export class CustodyViolationError extends Data.TaggedError(
  "CustodyViolationError"
)<{
  readonly reason: string;
}> {
  readonly code = "custody_violation" as const;
}

export type PatchGateOpts = {
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
};

/** Whether any of `ids` is a real Evidence id; `null` when one of them is not a UUID. */
function citesEvidence(ids: readonly string[]): boolean | null {
  if (!ids.some((id) => id.trim() !== "")) return false;
  const parsed = parseGraphUuidList([...ids]);
  return parsed === null ? null : parsed.length > 0;
}

function confidenceViolation(
  patch: readonly PatchOp[],
  opts: PatchGateOpts
): string | null {
  if (patchNeedsConfidence(patch) && !opts.confidence) {
    return "confidence is required for this Proposal";
  }
  if (opts.confidence !== "confirmed") return null;
  let anyEvidence = false;
  for (const op of patch) {
    const cites = citesEvidence(op.evidenceIds ?? []);
    if (cites === null) return "patch op evidenceIds contains an invalid UUID";
    anyEvidence ||= cites;
  }
  const shared = citesEvidence(opts.sharedEvidenceIds ?? []);
  if (shared === null) return "sharedEvidenceIds contains an invalid UUID";
  return confirmedEvidenceViolation({
    confidence: opts.confidence,
    evidenceCount: anyEvidence || shared ? 1 : 0,
  });
}

/**
 * The Accept rules that span a patch's ops (no DB): the confidence a patch needs, and the
 * Evidence a `confirmed` Accept needs across its ops and the shared ids. The shape of each op
 * is the patch op schema's (`#schemas/graph`), refused where the Proposal is created.
 */
export function assertPatchGates(
  patch: readonly PatchOp[],
  opts: PatchGateOpts = {}
): Effect.Effect<void, CustodyViolationError> {
  const reason = confidenceViolation(patch, opts);
  return reason === null
    ? Effect.void
    : Effect.fail(new CustodyViolationError({ reason }));
}
