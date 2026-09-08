import { z } from "zod";

import {
  createQuestionEffect,
  listQuestionsForEntityEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  updateQuestionEffect,
} from "@watchdog/core";
import {
  createQuestionInputSchema,
  entityScopeInputSchema,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas";

import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import { questionSchema, userOverrideSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/questions",
    summary: "List questions for an entity",
    tags: ["questions"],
  })
  .input(entityScopeInputSchema)
  .output(z.array(questionSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listQuestionsForEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId
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
      })
    )
  );
