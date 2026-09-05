import { z } from "zod";

import {
  createEntityEffect,
  deleteEntityEffect,
  getEntityByCaseSlugEffect,
  listEntitiesForCaseEffect,
  updateEntityFieldsEffect,
} from "@watchdog/core";
import { entityKindSchema } from "@watchdog/schemas";

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
  .input(z.object({ caseId: z.uuid() }))
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
  .input(z.object({ caseId: z.uuid(), slug: z.string().min(1) }))
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
  .input(
    z.object({
      caseId: z.uuid(),
      kind: entityKindSchema,
      name: z.string().min(1),
      slug: z.string().min(1),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
      kind: entityKindSchema.optional(),
      name: z.string().trim().min(1).optional(),
      summary: z.string().optional(),
      notes: z.string().optional(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
    })
  )
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
