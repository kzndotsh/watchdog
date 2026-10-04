import {
  confirmedNeedsEvidence,
  type ConfirmedEvidenceInput,
} from "@watchdog/policy/confirmed-evidence";
import type { ConfidenceTier } from "@watchdog/schemas/shared";

/**
 * Web adapter over the shared rule: counts a form's evidence ids (or takes a
 * precomputed count) and asks `@watchdog/policy/confirmed-evidence`. The
 * threshold and message live there, not here.
 */
export function isConfirmedBlocked(
  confidence: ConfidenceTier,
  evidenceIdsOrCount: readonly string[] | number
): boolean {
  const input: ConfirmedEvidenceInput = {
    confidence,
    evidenceCount:
      typeof evidenceIdsOrCount === "number"
        ? evidenceIdsOrCount
        : evidenceIdsOrCount.length,
  };
  return confirmedNeedsEvidence(input);
}
