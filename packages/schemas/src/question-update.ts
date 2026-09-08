import { z } from "zod";

import { questionScopeInputSchema } from "./graph-scope";
import { nonEmptyTrimmed, nullableTrimmedPatchSchema } from "./primitives";

/** Shared optional fields for question PATCH (web forms + API + CLI). */
export const questionUpdateFieldsSchema = z.object({
  text: nonEmptyTrimmed.optional(),
  resolvedNote: nullableTrimmedPatchSchema,
});

/** Question PATCH body including scope. */
export const updateQuestionInputSchema = questionScopeInputSchema
  .extend(questionUpdateFieldsSchema.shape)
  .refine(
    (data) => data.text !== undefined || data.resolvedNote !== undefined,
    { message: "At least one field is required" }
  );

export type QuestionUpdateFields = z.output<typeof questionUpdateFieldsSchema>;
export type UpdateQuestionInput = z.output<typeof updateQuestionInputSchema>;
