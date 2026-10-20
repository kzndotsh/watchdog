import { z } from "zod";

import {
  createEventEffect,
  deleteEventEffect,
  listEventsForEntityEffect,
  updateEventEffect,
} from "@watchdog/core/graph";
import {
  createEventInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
  listEntityChildrenInputSchema,
} from "@watchdog/schemas/graph";

import { graphActorFromContext } from "../actor-label";
import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import { eventSchema, userOverrideSchema, eventPageSchema } from "../schemas";

export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/events",
    summary: "List timeline events for an entity",
    tags: ["events"],
  })
  .input(listEntityChildrenInputSchema)
  .output(eventPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listEventsForEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId,
        { cursor: input.cursor, limit: input.limit }
      )
    )
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{entityId}/events",
    summary: "Create a timeline event",
    tags: ["events"],
    successStatus: 201,
  })
  .input(createEventInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(eventSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createEventEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/events/{eventId}",
    summary: "Update a timeline event",
    tags: ["events"],
  })
  .input(updateEventInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(eventSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateEventEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const remove = graphChildWrite
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/events/{eventId}",
    summary: "Delete a timeline event",
    tags: ["events"],
  })
  .input(
    eventScopeInputSchema.extend({
      userOverride: userOverrideSchema,
    })
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteEventEffect(
        input.caseId,
        context.actor.organizationId,
        input.eventId,
        graphActorFromContext(context)
      )
    );
    return { ok: true as const };
  });
