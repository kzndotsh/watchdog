import type { UntickedOpOutcome } from "@watchdog/domain/schemas/jobs";
import type { ConfidenceTier } from "@watchdog/domain/schemas/shared";

/** Client Accept composer values (confidence, optional evidence / attestation, chosen ops). */
export type AcceptFormValues = {
  confidence: ConfidenceTier;
  evidenceIds: string[];
  attestationText: string;
  /** Ops the reviewer unticked: a partial Accept applies the rest. */
  skippedOpIds: string[];
  /** What the unticked ops become: left alone, or rejected (fingerprinted). */
  untickedAs: UntickedOpOutcome;
};
