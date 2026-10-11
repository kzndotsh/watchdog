import type { ConfidenceTier } from "@watchdog/schemas/shared";

/** Client Accept composer values (confidence + optional evidence / attestation). */
export type AcceptFormValues = {
  confidence: ConfidenceTier;
  evidenceIds: string[];
  attestationText: string;
};
