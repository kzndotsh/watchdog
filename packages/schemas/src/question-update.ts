import { z } from "zod";

import { questionScopeInputSchema } from "./graph-scope";
import { NOTES_MAX } from "./limits";
import {
  expectedVersionSchema,
  nullableTextPatch,
  requiredText,
} from "./primitives";

/** Shared optional fields for question PATCH (web forms + API + CLI). */
export const questionUpdateFieldsSchema = z.object({
  text: requiredText(NOTES_MAX).optional(),
  resolvedNote: nullableTextPatch(NOTES_MAX),
});

/** Question PATCH body including scope. */
export const updateQuestionInputSchema = questionScopeInputSchema
  .extend({
    ...questionUpdateFieldsSchema.shape,
    expectedVersion: expectedVersionSchema,
  })
  .refine(
    (data) => data.text !== undefined || data.resolvedNote !== undefined,
    { message: "At least one field is required" }
  );

export type QuestionUpdateFields = z.output<typeof questionUpdateFieldsSchema>;
export type UpdateQuestionInput = z.output<typeof updateQuestionInputSchema>;
