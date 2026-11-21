import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { NOTES_MAX } from "./limits";
import { optionalText, trimmedUuidSchema } from "./primitives";

/** Shared fields for question resolve POST (web forms + API + CLI). */
export const resolveQuestionFieldsSchema = z.object({
  resolvedNote: optionalText(NOTES_MAX),
});

export const resolveQuestionInputSchema = z
  .object({
    caseId: trimmedCaseIdSchema,
    questionId: trimmedUuidSchema,
  })
  .extend(resolveQuestionFieldsSchema.shape);

export type ResolveQuestionFields = z.output<
  typeof resolveQuestionFieldsSchema
>;
export type ResolveQuestionInput = z.output<typeof resolveQuestionInputSchema>;
