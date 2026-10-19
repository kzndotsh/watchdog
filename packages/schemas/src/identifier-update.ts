import { z } from "zod";

import {
  optionalConfidenceTierSchema,
  optionalIdentifierStatusSchema,
  optionalIdentifierTypeSchema,
} from "./enums";
import { identifierScopeInputSchema } from "./graph-scope";
import { NAME_MAX, NOTES_MAX, URL_MAX } from "./limits";
import {
  expectedVersionSchema,
  nullableTextPatch,
  requiredText,
  uuidListSchema,
} from "./primitives";

/** Shared optional fields for identifier PATCH (web forms + API). */
export const identifierUpdateFieldsSchema = z.object({
  value: requiredText(URL_MAX).optional(),
  platform: nullableTextPatch(NAME_MAX),
  type: optionalIdentifierTypeSchema,
  status: optionalIdentifierStatusSchema,
  confidence: optionalConfidenceTierSchema,
  notes: nullableTextPatch(NOTES_MAX),
  evidenceIds: uuidListSchema.optional(),
});

/** Identifier PATCH body including scope. */
export const updateIdentifierInputSchema = identifierScopeInputSchema
  .extend({
    ...identifierUpdateFieldsSchema.shape,
    expectedVersion: expectedVersionSchema,
  })
  .refine(
    (data) =>
      data.value !== undefined ||
      data.platform !== undefined ||
      data.type !== undefined ||
      data.status !== undefined ||
      data.confidence !== undefined ||
      data.notes !== undefined ||
      data.evidenceIds !== undefined,
    { message: "At least one field is required" }
  );

/** Identifier DELETE body including scope. */
export const deleteIdentifierInputSchema = identifierScopeInputSchema;

export type IdentifierUpdateFields = z.output<
  typeof identifierUpdateFieldsSchema
>;
export type UpdateIdentifierInput = z.output<
  typeof updateIdentifierInputSchema
>;
export type DeleteIdentifierInput = z.output<
  typeof deleteIdentifierInputSchema
>;
