import { z } from "zod";

import {
  createQuestionEffect,
  listQuestionsForEntityEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  updateQuestionEffect,
} from "@watchdog/core";

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
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
    })
  )
  .output(z.array(questionSchema))
  .handler(async ({ input }) =>
    runApp(listQuestionsForEntityEffect(input.caseId, input.entityId))
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{entityId}/questions",
    summary: "Create a question",
    tags: ["questions"],
    successStatus: 201,
  })
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
      text: z.string().min(1),
      userOverride: userOverrideSchema,
    })
  )
  .output(questionSchema)
  .handler(async ({ input }) => runApp(createQuestionEffect(input)));

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/questions/{questionId}",
    summary: "Update a question",
    tags: ["questions"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      questionId: z.uuid(),
      text: z.string().min(1).optional(),
      resolvedNote: z.string().nullable().optional(),
      userOverride: userOverrideSchema,
    })
  )
  .output(questionSchema)
  .handler(async ({ input }) => runApp(updateQuestionEffect(input)));

export const resolve = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/questions/{questionId}/resolve",
    summary: "Resolve a question",
    tags: ["questions"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      questionId: z.uuid(),
      resolvedNote: z.string().optional(),
      userOverride: userOverrideSchema,
    })
  )
  .output(questionSchema)
  .handler(async ({ input }) => runApp(resolveQuestionEffect(input)));

export const reopen = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/questions/{questionId}/reopen",
    summary: "Reopen a resolved question",
    tags: ["questions"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      questionId: z.uuid(),
      userOverride: userOverrideSchema,
    })
  )
  .output(questionSchema)
  .handler(async ({ input }) => runApp(reopenQuestionEffect(input)));
