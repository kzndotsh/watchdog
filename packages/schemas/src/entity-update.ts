import { z } from "zod";

import { optionalEntityKindSchema } from "./enums";
import { entityScopeInputSchema } from "./graph-scope";
import { NAME_MAX, NOTES_MAX } from "./limits";
import {
  expectedVersionSchema,
  nullableTextPatch,
  requiredText,
} from "./primitives";

/** Shared optional fields for entity PATCH (web forms + API + CLI). */
export const entityUpdateFieldsSchema = z.object({
  kind: optionalEntityKindSchema,
  name: requiredText(NAME_MAX).optional(),
  summary: nullableTextPatch(NOTES_MAX),
  notes: nullableTextPatch(NOTES_MAX),
});

/** Entity PATCH body including scope. */
export const updateEntityInputSchema = entityScopeInputSchema
  .extend({
    ...entityUpdateFieldsSchema.shape,
    expectedVersion: expectedVersionSchema,
  })
  .refine(
    (data) =>
      data.kind !== undefined ||
      data.name !== undefined ||
      data.summary !== undefined ||
      data.notes !== undefined,
    { message: "At least one field is required" }
  );

/** Entity DELETE body including scope. */
export const deleteEntityInputSchema = entityScopeInputSchema;

export type EntityUpdateFields = z.output<typeof entityUpdateFieldsSchema>;
export type UpdateEntityInput = z.output<typeof updateEntityInputSchema>;
export type DeleteEntityInput = z.output<typeof deleteEntityInputSchema>;
