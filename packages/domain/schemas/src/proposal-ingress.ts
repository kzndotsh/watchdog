import { z } from "zod";

import { optionalConfidenceTierSchema } from "./enums";
import { trimmedCaseIdSchema } from "./ids";
import { NOTES_MAX } from "./limits";
import { patchInputSchema } from "./patch";
import { optionalText, trimmedUuidSchema, uuidListSchema } from "./primitives";

/** Shared patch payload for Proposal create and agent graph write. */
export const proposalPatchFieldsSchema = z.object({
  patch: patchInputSchema.min(1),
  summary: optionalText(NOTES_MAX),
  evidenceIds: uuidListSchema.optional(),
});

export const createProposalInputSchema = z
  .object({
    caseId: trimmedCaseIdSchema,
  })
  .extend(proposalPatchFieldsSchema.shape);

/** What a partial Accept does with the ops it does not apply. */
export const UNTICKED_OP_OUTCOMES = ["left", "rejected"] as const;
export type UntickedOpOutcome = (typeof UNTICKED_OP_OUTCOMES)[number];

export const acceptProposalInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  proposalId: trimmedUuidSchema,
  confidence: optionalConfidenceTierSchema,
  sharedEvidenceIds: uuidListSchema.optional().default([]),
  attestationText: optionalText(NOTES_MAX),
  /**
   * The ops to apply (a partial Accept); omitted applies the whole patch. Each must be an op of
   * the Proposal, and every op one of them names must be among them.
   */
  opIds: uuidListSchema.optional(),
  /**
   * The ops not applied: `left` (default) records nothing, so a later run may propose them
   * again; `rejected` fingerprints them like a Reject.
   */
  untickedAs: z.enum(UNTICKED_OP_OUTCOMES).optional().default("left"),
});

export const rejectProposalInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  proposalId: trimmedUuidSchema,
  reason: optionalText(NOTES_MAX),
});

export type CreateProposalInput = z.output<typeof createProposalInputSchema>;
export type AcceptProposalInput = z.output<typeof acceptProposalInputSchema>;
export type RejectProposalInput = z.output<typeof rejectProposalInputSchema>;
