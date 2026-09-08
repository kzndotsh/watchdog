import { z } from "zod";

import {
  optionalClaimClassSchema,
  optionalConfidenceTierSchema,
} from "./enums";
import { claimScopeInputSchema } from "./graph-scope";
import { nonEmptyTrimmed, uuidListSchema } from "./primitives";

/** Shared optional fields for claim PATCH (web forms + API + CLI). */
export const claimUpdateFieldsSchema = z.object({
  text: nonEmptyTrimmed.optional(),
  class: optionalClaimClassSchema,
  confidence: optionalConfidenceTierSchema,
  evidenceIds: uuidListSchema.optional(),
});

/** Claim PATCH body including scope. */
export const updateClaimInputSchema = claimScopeInputSchema
  .extend(claimUpdateFieldsSchema.shape)
  .refine(
    (data) =>
      data.text !== undefined ||
      data.class !== undefined ||
      data.confidence !== undefined ||
      data.evidenceIds !== undefined,
    { message: "At least one field is required" }
  );

export type ClaimUpdateFields = z.output<typeof claimUpdateFieldsSchema>;
export type UpdateClaimInput = z.output<typeof updateClaimInputSchema>;
