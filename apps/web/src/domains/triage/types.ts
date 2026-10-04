import type { ConfidenceTier } from "@watchdog/schemas";

/** Client Accept composer values (confidence + optional evidence / attestation). */
export interface AcceptFormValues {
  confidence: ConfidenceTier;
  evidenceIds: string[];
  attestationText: string;
}
