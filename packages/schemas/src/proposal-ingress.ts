import { z } from "zod";

import {
  optionalConfidenceTierSchema,
  optionalProposalStatusSchema,
} from "./enums";
import { trimmedCaseIdSchema } from "./ids";
import { patchOpSchema } from "./patch";
import {
  optionalTrimmedSchema,
  trimmedUuidSchema,
  uuidListSchema,
} from "./primitives";

/** Shared patch payload for Proposal create and agent graph write. */
export const proposalPatchFieldsSchema = z.object({
  patch: z.array(patchOpSchema).min(1),
  summary: optionalTrimmedSchema,
  evidenceIds: uuidListSchema.optional(),
});

export const createProposalInputSchema = z
  .object({
    caseId: trimmedCaseIdSchema,
  })
  .extend(proposalPatchFieldsSchema.shape);

export const listProposalsInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  status: optionalProposalStatusSchema,
});

export const acceptProposalInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  proposalId: trimmedUuidSchema,
  confidence: optionalConfidenceTierSchema,
  sharedEvidenceIds: uuidListSchema.optional().default([]),
  attestationText: optionalTrimmedSchema,
});

export const rejectProposalInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  proposalId: trimmedUuidSchema,
  reason: optionalTrimmedSchema,
});

export type CreateProposalInput = z.output<typeof createProposalInputSchema>;
export type ListProposalsInput = z.output<typeof listProposalsInputSchema>;
export type AcceptProposalInput = z.output<typeof acceptProposalInputSchema>;
export type RejectProposalInput = z.output<typeof rejectProposalInputSchema>;
