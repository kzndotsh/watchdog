import type { z } from "zod";

import type { ClaimRecord as CoreClaimRecord } from "@watchdog/core/graph";
import type {
  createClaimInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas/graph";
import type { ClaimClass, ConfidenceTier } from "@watchdog/schemas/shared";

export type ClaimRecord = CoreClaimRecord;

export type CreateClaimInput = z.input<typeof createClaimInputSchema>;
export type CreateClaimParsed = z.output<typeof createClaimInputSchema>;

export type RetractClaimInput = z.output<typeof retractClaimInputSchema>;

export type UpdateClaimInput = z.output<typeof updateClaimInputSchema>;

/** What the Claim form collects; the create and update mutations map it to the write. */
export type ClaimFormValues = {
  text: string;
  claimClass: ClaimClass;
  confidence: ConfidenceTier;
  evidenceIds: string[];
};
