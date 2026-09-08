import type { z } from "zod";

import type { QuestionRecord as CoreQuestionRecord } from "@watchdog/core";
import {
  createQuestionInputSchema,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas";

export type QuestionRecord = CoreQuestionRecord;

export {
  entityScopeInputSchema,
  type EntityScopeInput,
} from "@watchdog/schemas";

export { createQuestionInputSchema };
export type CreateQuestionInput = z.output<typeof createQuestionInputSchema>;

export { resolveQuestionInputSchema };
export type ResolveQuestionInput = z.output<typeof resolveQuestionInputSchema>;

export { questionScopeInputSchema };
export type QuestionScopeInput = z.output<typeof questionScopeInputSchema>;

export { updateQuestionInputSchema };
export type UpdateQuestionInput = z.output<typeof updateQuestionInputSchema>;
