import { createServerFn } from "@tanstack/react-start";

import type { QuestionRecord } from "@/domains/entities/questions/types";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  createQuestionInputSchema,
  questionList,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

export type { QuestionRecord } from "@/domains/entities/questions/types";

/**
 * One page of the Case's Question list (`questionList`, ADR-0007): the declared filters, `q`, sort and
 * cursor pass through whole. One Entity's Questions are this list with `entityId` set.
 */
export const listQuestionsPageFn = createServerFn({ method: "GET" })
  .validator(questionList.input)
  .handler(async ({ data, context }): Promise<ListPage<QuestionRecord>> =>
    orpcFromContext(context).questions.list(data)
  );

export const createQuestionFn = createServerFn({ method: "POST" })
  .validator(createQuestionInputSchema)
  .handler(async ({ data, context }): Promise<QuestionRecord> =>
    orpcFromContext(context).questions.create(data)
  );

export const resolveQuestionFn = createServerFn({ method: "POST" })
  .validator(resolveQuestionInputSchema)
  .handler(async ({ data, context }): Promise<QuestionRecord> =>
    orpcFromContext(context).questions.resolve(data)
  );

export const updateQuestionFn = createServerFn({ method: "POST" })
  .validator(updateQuestionInputSchema)
  .handler(async ({ data, context }): Promise<QuestionRecord> =>
    orpcFromContext(context).questions.update(data)
  );

export const reopenQuestionFn = createServerFn({ method: "POST" })
  .validator(questionScopeInputSchema)
  .handler(async ({ data, context }): Promise<QuestionRecord> =>
    orpcFromContext(context).questions.reopen(data)
  );

export const deleteQuestionFn = createServerFn({ method: "POST" })
  .validator(questionScopeInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).questions.delete({
      caseId: data.caseId,
      questionId: data.questionId,
    });
  });
