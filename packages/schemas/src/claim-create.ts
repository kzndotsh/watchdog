import { z } from "zod";

import { trimmedClaimClassSchema, trimmedConfidenceTierSchema } from "./enums";
import { entityScopeInputSchema } from "./graph-scope";
import { nonEmptyTrimmed, uuidListSchema } from "./primitives";

/** Shared fields for claim POST (web forms + API + CLI). */
export const createClaimFieldsSchema = z.object({
  text: nonEmptyTrimmed,
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
