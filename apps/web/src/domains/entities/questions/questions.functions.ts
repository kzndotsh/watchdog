import { createServerFn } from "@tanstack/react-start";

import type { QuestionRecord } from "@/domains/entities/questions/types";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  createQuestionInputSchema,
  entityScopeInputSchema,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas/graph";

export type { QuestionRecord } from "@/domains/entities/questions/types";

export const listQuestionsFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<QuestionRecord[]> =>
    orpcFromContext(context).questions.list({
      caseId: data.caseId,
      entityId: data.entityId,
    })
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
