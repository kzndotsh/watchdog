import { z } from "zod";

import { entityScopeInputSchema } from "./graph-scope";
import { NOTES_MAX } from "./limits";
import { requiredText } from "./primitives";

/** Shared fields for question POST (web forms + API + CLI). */
export const createQuestionFieldsSchema = z.object({
  text: requiredText(NOTES_MAX),
});

/** Question POST body including entity scope. */
export const createQuestionInputSchema = entityScopeInputSchema.extend(
  createQuestionFieldsSchema.shape
);

export type CreateQuestionFields = z.output<typeof createQuestionFieldsSchema>;
export type CreateQuestionInput = z.output<typeof createQuestionInputSchema>;
