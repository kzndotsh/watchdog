import { z } from "zod";

import {
  createEventEffect,
  deleteEventEffect,
  listEventsForEntityEffect,
  updateEventEffect,
} from "@watchdog/core";
import {
  createEventInputSchema,
  entityScopeInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas";

import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import { eventSchema, userOverrideSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/events",
    summary: "List timeline events for an entity",
    tags: ["events"],
  })
  .input(entityScopeInputSchema)
  .output(z.array(eventSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listEventsForEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId
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
        input.eventId
      )
    );
    return { ok: true as const };
  });
