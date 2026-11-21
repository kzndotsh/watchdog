import { z } from "zod";

import { trimmedClaimClassSchema, trimmedConfidenceTierSchema } from "./enums";
import { entityScopeInputSchema } from "./graph-scope";
import { NOTES_MAX } from "./limits";
import { requiredText, uuidListSchema } from "./primitives";

/** Shared fields for claim POST (web forms + API + CLI). */
export const createClaimFieldsSchema = z.object({
  text: requiredText(NOTES_MAX),
  confidence: trimmedConfidenceTierSchema,
  class: trimmedClaimClassSchema.default("observation"),
  evidenceIds: uuidListSchema.optional(),
});

/** Claim POST body including entity scope. */
export const createClaimInputSchema = entityScopeInputSchema.extend(
  createClaimFieldsSchema.shape
);

export type CreateClaimFields = z.output<typeof createClaimFieldsSchema>;
export type CreateClaimInput = z.input<typeof createClaimInputSchema>;
export type CreateClaimParsed = z.output<typeof createClaimInputSchema>;
