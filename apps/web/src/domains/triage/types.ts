import { z } from "zod";

import {
  confidenceTierSchema,
  optionalTrimmedSchema,
  proposalStatusSchema,
  uuidListSchema,
  uuidSchema,
  type ConfidenceTier,
} from "@watchdog/schemas";

export const listProposalsInputSchema = z.object({
  caseId: uuidSchema,
  status: proposalStatusSchema.optional(),
});
export type ListProposalsInput = z.output<typeof listProposalsInputSchema>;

export const acceptProposalInputSchema = z.object({
  caseId: uuidSchema,
  proposalId: uuidSchema,
  confidence: confidenceTierSchema.optional(),
  sharedEvidenceIds: uuidListSchema.optional().default([]),
  attestationText: optionalTrimmedSchema,
});
export type AcceptProposalInput = z.output<typeof acceptProposalInputSchema>;

export const rejectProposalInputSchema = z.object({
  caseId: uuidSchema,
  proposalId: uuidSchema,
  reason: optionalTrimmedSchema,
});
export type RejectProposalInput = z.output<typeof rejectProposalInputSchema>;

/** Client Accept composer values (confidence + optional evidence / attestation). */
export interface AcceptFormValues {
  confidence: ConfidenceTier;
  evidenceIds: string[];
  attestationText: string;
}
