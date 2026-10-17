import { z } from "zod";

import {
  createCaseEffect,
  deleteCaseEffect,
  getCaseByIdEffect,
  getCaseBySlugEffect,
  listCasesEffect,
  updateCaseEffect,
} from "@watchdog/core/cases";
import {
  createCaseInputSchema,
  deleteCaseInputSchema,
  getCaseBySlugInputSchema,
  updateCaseInputSchema,
} from "@watchdog/schemas/cases";

import { graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import { caseSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases",
    summary: "List cases",
    tags: ["cases"],
  })
  .output(z.array(caseSchema))
  .handler(async ({ context }) =>
    runApp(listCasesEffect(context.actor.organizationId))
  );

export const get = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}",
    summary: "Get case by id",
    tags: ["cases"],
  })
  .input(deleteCaseInputSchema)
  .output(caseSchema)
  .handler(async ({ input, context }) =>
    runApp(getCaseByIdEffect(input.caseId, context.actor.organizationId))
  );

export const getBySlug = authed
  .route({
    method: "GET",
    path: "/case-slugs/{caseSlug}",
    summary:
      "Get case by slug (what a Case URL names); a slug the organization cannot see is not found",
    tags: ["cases"],
  })
  .input(getCaseBySlugInputSchema)
  .output(caseSchema)
  .handler(async ({ input, context }) =>
    runApp(getCaseBySlugEffect(input.caseSlug, context.actor.organizationId))
  );

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
  .handler(async ({ input, context }) =>
    runApp(
      createCaseEffect({
        ...input,
        organizationId: context.actor.organizationId,
      })
    )
  );

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
  .handler(async ({ input, context }) =>
    runApp(
      updateCaseEffect({
        id: input.caseId,
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context.actor),
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
  .input(deleteCaseInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteCaseEffect(input.caseId, {
        actorId: context.actor.userId,
        organizationId: context.actor.organizationId,
      })
    );
    return { ok: true as const };
  });
