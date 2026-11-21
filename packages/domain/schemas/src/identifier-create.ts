import { z } from "zod";

import {
  trimmedConfidenceTierSchema,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
} from "./enums";
import { entityScopeInputSchema } from "./graph-scope";
import { NAME_MAX, NOTES_MAX, URL_MAX } from "./limits";
import { optionalText, requiredText, uuidListSchema } from "./primitives";
import { validateIdentifierWrite } from "./validate-identifier";

/** Shared fields for identifier POST (web forms + API + CLI). */
export const createIdentifierFieldsSchema = z.object({
  type: trimmedIdentifierTypeSchema,
  value: requiredText(URL_MAX),
  confidence: trimmedConfidenceTierSchema,
  platform: optionalText(NAME_MAX),
  status: trimmedIdentifierStatusSchema.default("unknown"),
  notes: optionalText(NOTES_MAX),
  evidenceIds: uuidListSchema.optional(),
});

/** Identifier POST body including entity scope. */
export const createIdentifierInputSchema = entityScopeInputSchema
  .extend(createIdentifierFieldsSchema.shape)
  .superRefine((input, ctx) => {
    const result = validateIdentifierWrite({
      type: input.type,
      value: input.value,
      platform: input.platform,
    });
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: result.message,
        path: ["value"],
      });
    }
  });

export type CreateIdentifierFields = z.output<
  typeof createIdentifierFieldsSchema
>;
export type CreateIdentifierInput = z.input<typeof createIdentifierInputSchema>;
export type CreateIdentifierParsed = z.output<
  typeof createIdentifierInputSchema
>;
