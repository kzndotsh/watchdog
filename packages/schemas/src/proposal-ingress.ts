import { z } from "zod";

import {
  optionalConfidenceTierSchema,
  optionalProposalStatusSchema,
} from "./enums";
import { trimmedCaseIdSchema } from "./ids";
import { ARRAY_MAX, NOTES_MAX } from "./limits";
import { pageInputFields } from "./pagination";
import { patchOpInputSchema } from "./patch";
import { optionalText, trimmedUuidSchema, uuidListSchema } from "./primitives";

/** Shared patch payload for Proposal create and agent graph write. */
export const proposalPatchFieldsSchema = z.object({
  patch: z.array(patchOpInputSchema).min(1).max(ARRAY_MAX),
  summary: optionalText(NOTES_MAX),
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
  ...pageInputFields,
});

export const acceptProposalInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  proposalId: trimmedUuidSchema,
  confidence: optionalConfidenceTierSchema,
  sharedEvidenceIds: uuidListSchema.optional().default([]),
  attestationText: optionalText(NOTES_MAX),
});

export const rejectProposalInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  proposalId: trimmedUuidSchema,
  reason: optionalText(NOTES_MAX),
});

export type CreateProposalInput = z.output<typeof createProposalInputSchema>;
export type ListProposalsInput = z.output<typeof listProposalsInputSchema>;
export type AcceptProposalInput = z.output<typeof acceptProposalInputSchema>;
export type RejectProposalInput = z.output<typeof rejectProposalInputSchema>;
