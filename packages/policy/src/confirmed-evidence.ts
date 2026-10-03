import type { ConfidenceTier } from "@watchdog/schemas";

/**
 * The one "confirmed needs Evidence" rule. Pure and free of Effect and node
 * imports so browser code can import it through
 * `@watchdog/policy/confirmed-evidence`. Callers decide what counts as one
 * piece of Evidence (attachments, linked job Evidence, an attestation) and
 * pass the total as `evidenceCount`; this module owns the threshold and the
 * message text. The message literal lives only here (guarded by
 * `confirmed-evidence-literal.test.ts`).
 */
export const CONFIRMED_REQUIRES_EVIDENCE =
  "confirmed requires at least one Evidence attachment";

export interface ConfirmedEvidenceInput {
  readonly confidence: ConfidenceTier | undefined;
  readonly evidenceCount: number;
}

/** True when the write must be refused: confirmed with fewer than one piece of Evidence. */
export function confirmedNeedsEvidence(input: ConfirmedEvidenceInput): boolean {
  if (input.confidence !== "confirmed") return false;
  return !(input.evidenceCount >= 1);
}

/** The refusal message, or `null` when the write is allowed. */
export function confirmedEvidenceViolation(
  input: ConfirmedEvidenceInput
): string | null {
  return confirmedNeedsEvidence(input) ? CONFIRMED_REQUIRES_EVIDENCE : null;
}
