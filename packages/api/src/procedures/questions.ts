import { z } from "zod";

import {
  createQuestionEffect,
  deleteQuestionEffect,
  getQuestionsByIdsEffect,
  listQuestionsEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  updateQuestionEffect,
} from "@watchdog/core/graph";
import {
  createQuestionInputSchema,
  questionList,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
  getQuestionsInputSchema,
} from "@watchdog/schemas/graph";
import { ARRAY_MAX, boundedListSchema } from "@watchdog/schemas/shared";

import { graphActorFromContext } from "../actor-label";
import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import {
  questionListPageSchema,
  questionSchema,
  userOverrideSchema,
} from "../schemas";

/**
 * The Case's Question list (`questionList`, ADR-0007). One Entity's Questions are this list with
 * `entityId` set; there is no per-Entity route. The handler passes the parsed input through.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/questions",
    summary: "List questions in a case",
    tags: ["questions"],
  })
  .input(questionList.input)
  .output(questionListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listQuestionsEffect(input.caseId, context.actor.organizationId, input)
    )
  );

/**
 * Questions by id, at most `ARRAY_MAX` (a row's version before an update); ids outside the Case are
 * left out.
 */
export const getMany = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/questions/by-ids",
    summary: "Get questions by id",
    tags: ["questions"],
  })
  .input(getQuestionsInputSchema)
  .output(boundedListSchema(questionSchema, ARRAY_MAX))
  .handler(async ({ input, context }) =>
    runApp(
      getQuestionsByIdsEffect(
        input.caseId,
        context.actor.organizationId,
        input.ids
      )
    )
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{entityId}/questions",
    summary: "Create a question",
    tags: ["questions"],
    successStatus: 201,
  })
  .input(createQuestionInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(questionSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createQuestionEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/questions/{questionId}",
    summary: "Update a question",
    tags: ["questions"],
  })
  .input(updateQuestionInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(questionSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateQuestionEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const resolve = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/questions/{questionId}/resolve",
    summary: "Resolve a question",
    tags: ["questions"],
  })
  .input(
    resolveQuestionInputSchema.extend({
      userOverride: userOverrideSchema,
    })
  )
  .output(questionSchema)
  .handler(async ({ input, context }) =>
    runApp(
      resolveQuestionEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const reopen = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/questions/{questionId}/reopen",
    summary: "Reopen a resolved question",
    tags: ["questions"],
  })
  .input(
    questionScopeInputSchema.extend({
      userOverride: userOverrideSchema,
    })
  )
  .output(questionSchema)
  .handler(async ({ input, context }) =>
    runApp(
      reopenQuestionEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const remove = graphChildWrite
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/questions/{questionId}",
    summary: "Delete a question",
    tags: ["questions"],
  })
  .input(
    questionScopeInputSchema.extend({
      userOverride: userOverrideSchema,
    })
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteQuestionEffect(
        input.caseId,
        context.actor.organizationId,
        input.questionId,
        graphActorFromContext(context)
      )
    );
    return { ok: true as const };
  });
