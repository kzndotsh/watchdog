import { z } from "zod";

import {
  createEntityEffect,
  deleteEntityEffect,
  getEntityByCaseSlugEffect,
  listEntitiesForCaseEffect,
  updateEntityFieldsEffect,
} from "@watchdog/core/graph";
import { recordAiHandoffEffect } from "@watchdog/core/organization";
import {
  caseScopeInputSchema,
  createEntityInputSchema,
  deleteEntityInputSchema,
  entitySlugScopeInputSchema,
  updateEntityInputSchema,
} from "@watchdog/schemas/graph";
import { recordAiHandoffInputSchema } from "@watchdog/schemas/shared";

import { graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import { entitySchema } from "../schemas";

export const list = authed
  .meta({ scope: "cases:read" })
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
