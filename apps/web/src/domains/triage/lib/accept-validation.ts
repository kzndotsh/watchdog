import { isConfirmedBlocked } from "@/domains/dossier/lib/confirmed-evidence";
import type { ConfidenceTier } from "@watchdog/schemas";

export function totalEvidenceCount(
  evidenceIds: string[],
  linkedIds: string[],
  attestationText: string
): number {
  return (
    evidenceIds.length + linkedIds.length + (attestationText.trim() ? 1 : 0)
  );
}

export function isConfirmedWithoutBundle(
  confidence: ConfidenceTier,
  evidenceIds: string[],
  linkedIds: string[],
  attestationText: string
): boolean {
  return isConfirmedBlocked(
    confidence,
    totalEvidenceCount(evidenceIds, linkedIds, attestationText)
  );
}
