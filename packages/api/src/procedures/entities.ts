import { z } from "zod";

import {
  createEntityEffect,
  deleteEntityEffect,
  getEntitiesByIdsEffect,
  getEntityByCaseSlugEffect,
  listEntitiesForCaseEffect,
  updateEntityFieldsEffect,
} from "@watchdog/core/graph";
import { recordAiHandoffEffect } from "@watchdog/core/organization";
import {
  createEntityInputSchema,
  deleteEntityInputSchema,
  entityList,
  entitySlugScopeInputSchema,
  getEntitiesInputSchema,
  updateEntityInputSchema,
} from "@watchdog/schemas/graph";
import { recordAiHandoffInputSchema } from "@watchdog/schemas/shared";

import { graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import { entitySchema, entityListPageSchema } from "../schemas";

/**
 * The Case's Entity list (`entityList`, ADR-0007): filters, `q` and sort, a page at a time with
 * `total` on the first page. The handler passes the parsed input through.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities",
    summary: "List entities for a case",
    tags: ["entities"],
  })
  .input(entityList.input)
  .output(entityListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listEntitiesForCaseEffect(
        input.caseId,
        context.actor.organizationId,
        input
      )
    )
  );

/**
 * Entities by id (a picker's value, a filter chip's title), at most `ARRAY_MAX`; ids outside the
 * Case are left out. Its own path: under `/entities/` it would shadow an Entity slugged `by-ids`.
 */
export const getMany = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities-by-ids",
    summary: "Get entities by id",
    tags: ["entities"],
  })
  .input(getEntitiesInputSchema)
  .output(entitySchema.array())
  .handler(async ({ input, context }) =>
    runApp(
      getEntitiesByIdsEffect(
        input.caseId,
        context.actor.organizationId,
        input.ids
      )
    )
  );

export const get = authed
  .meta({ scope: "cases:read" })
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
  .meta({ scope: "graph:write" })
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
        ...graphActorFromContext(context),
      })
    )
  );

export const update = authed
  .meta({ scope: "graph:write" })
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
        ...graphActorFromContext(context),
      })
    )
  );

export const remove = authed
  .meta({ scope: "graph:write" })
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
        input.entityId,
        graphActorFromContext(context)
      )
    );
    return { ok: true as const };
  });

export const recordAiHandoff = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{slug}/ai-handoff",
    summary:
      "Record that an entity's Markdown is handed to an external AI (activity entry; never the text)",
    tags: ["entities"],
  })
  .input(recordAiHandoffInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      recordAiHandoffEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        slug: input.slug,
        destination: input.destination,
        ...graphActorFromContext(context),
      })
    );
    return { ok: true as const };
  });
