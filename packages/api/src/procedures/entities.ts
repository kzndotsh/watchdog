import { z } from "zod";

import {
  createEntityEffect,
  deleteEntityEffect,
  getEntityByCaseSlugEffect,
  listEntitiesForCaseEffect,
  updateEntityFieldsEffect,
} from "@watchdog/core";
import {
  caseScopeInputSchema,
  createEntityInputSchema,
  deleteEntityInputSchema,
  entitySlugScopeInputSchema,
  updateEntityInputSchema,
} from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import { entitySchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities",
    summary: "List entities for a case",
    tags: ["entities"],
  })
  .input(caseScopeInputSchema)
  .output(z.array(entitySchema))
  .handler(async ({ input, context }) =>
    runApp(
      listEntitiesForCaseEffect(input.caseId, context.actor.organizationId)
    )
  );

export const get = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{slug}",
    summary: "Get entity by slug",
    tags: ["entities"],
  })
  .input(entitySlugScopeInputSchema)
  .output(entitySchema)
  .handler(async ({ input, context }) =>
    runApp(
      getEntityByCaseSlugEffect(
        input.caseId,
        context.actor.organizationId,
        input.slug
      )
    )
  );

export const create = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities",
    summary: "Create an entity",
    tags: ["entities"],
    successStatus: 201,
  })
  .input(createEntityInputSchema)
  .output(entitySchema)
  .handler(async ({ input, context }) =>
    runApp(
      createEntityEffect({
        ...input,
        organizationId: context.actor.organizationId,
      })
    )
  );

export const update = authed
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/entities/{entityId}",
    summary: "Update entity kind, name, summary, or notes",
    tags: ["entities"],
  })
  .input(updateEntityInputSchema)
  .output(entitySchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateEntityFieldsEffect({
        ...input,
        organizationId: context.actor.organizationId,
      })
    )
  );

export const remove = authed
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/entities/{entityId}",
    summary: "Delete an entity",
    tags: ["entities"],
  })
  .input(deleteEntityInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId
      )
    );
    return { ok: true as const };
  });
