import type { z } from "zod";

import type { QuestionRecord as CoreQuestionRecord } from "@watchdog/core/graph";
import type {
  createQuestionInputSchema,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas";

export type QuestionRecord = CoreQuestionRecord;

export type CreateQuestionInput = z.output<typeof createQuestionInputSchema>;

export type ResolveQuestionInput = z.output<typeof resolveQuestionInputSchema>;

export type QuestionScopeInput = z.output<typeof questionScopeInputSchema>;

export type UpdateQuestionInput = z.output<typeof updateQuestionInputSchema>;
