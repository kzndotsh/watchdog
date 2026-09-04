import { z } from "zod";

import {
  createCaseEffect,
  deleteCaseEffect,
  getCaseByIdEffect,
  listCasesEffect,
  updateCaseEffect,
} from "@watchdog/core";

import { authed } from "../os";
import { runApp } from "../runtime";
import {
  caseSchema,
  createCaseInputSchema,
  updateCaseInputSchema,
} from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases",
    summary: "List cases",
    tags: ["cases"],
  })
  .output(z.array(caseSchema))
  .handler(async () => runApp(listCasesEffect()));

export const get = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}",
    summary: "Get case by id",
    tags: ["cases"],
  })
  .input(z.object({ caseId: z.uuid() }))
  .output(caseSchema)
  .handler(async ({ input }) => runApp(getCaseByIdEffect(input.caseId)));

export const create = authed
  .route({
    method: "POST",
    path: "/cases",
    summary: "Create a case",
    tags: ["cases"],
    successStatus: 201,
  })
  .input(createCaseInputSchema)
  .output(caseSchema)
  .handler(async ({ input }) => runApp(createCaseEffect(input)));

export const update = authed
  .route({
    method: "PATCH",
    path: "/cases/{caseId}",
    summary:
      "Update case name (regenerates slug), description, or third-party egress",
    tags: ["cases"],
  })
  .input(updateCaseInputSchema)
  .output(caseSchema)
  .handler(async ({ input }) =>
    runApp(
      updateCaseEffect({
        id: input.caseId,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.allowThirdPartyEgress === undefined
          ? {}
          : { allowThirdPartyEgress: input.allowThirdPartyEgress }),
      })
    )
  );

export const remove = authed
  .route({
    method: "DELETE",
    path: "/cases/{caseId}",
    summary: "Delete a case and cascaded graph / jobs / evidence",
    tags: ["cases"],
  })
  .input(z.object({ caseId: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteCaseEffect(input.caseId, { actorId: context.actor.userId })
    );
    return { ok: true as const };
  });
