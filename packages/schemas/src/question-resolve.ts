import { z } from "zod";

import { optionalTrimmedSchema, trimmedUuidSchema } from "./primitives";

/** Shared fields for question resolve POST (web forms + API + CLI). */
export const resolveQuestionFieldsSchema = z.object({
  resolvedNote: optionalTrimmedSchema,
});

export const resolveQuestionInputSchema = z
  .object({
    caseId: trimmedUuidSchema,
    questionId: trimmedUuidSchema,
  })
  .extend(resolveQuestionFieldsSchema.shape);

export type ResolveQuestionFields = z.output<
  typeof resolveQuestionFieldsSchema
>;
export type ResolveQuestionInput = z.output<typeof resolveQuestionInputSchema>;
