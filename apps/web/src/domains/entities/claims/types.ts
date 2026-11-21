import type {
  ClaimClass,
  ConfidenceTier,
} from "@watchdog/domain/schemas/shared";
import type { ClaimRecord as CoreClaimRecord } from "@watchdog/server/core/graph";

export type ClaimRecord = CoreClaimRecord;

/** What the Claim form collects; the create and update mutations map it to the write. */
export type ClaimFormValues = {
  text: string;
  claimClass: ClaimClass;
  confidence: ConfidenceTier;
  evidenceIds: string[];
};
