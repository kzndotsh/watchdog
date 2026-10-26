import { z } from "zod";

import {
  createEventEffect,
  deleteEventEffect,
  getEventsByIdsEffect,
  listEventsEffect,
  updateEventEffect,
} from "@watchdog/core/graph";
import {
  createEventInputSchema,
  eventList,
  eventScopeInputSchema,
  updateEventInputSchema,
  getEventsInputSchema,
} from "@watchdog/schemas/graph";
import { ARRAY_MAX, boundedListSchema } from "@watchdog/schemas/shared";

import { graphActorFromContext } from "../actor-label";
import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import {
  eventListPageSchema,
  eventSchema,
  userOverrideSchema,
} from "../schemas";

/**
 * The Case's Event list (`eventList`, ADR-0007). One Entity's Events are this list with
 * `entityId` set; there is no per-Entity route. The handler passes the parsed input through.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/events",
    summary: "List timeline events in a case",
    tags: ["events"],
  })
  .input(eventList.input)
  .output(eventListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(listEventsEffect(input.caseId, context.actor.organizationId, input))
  );

/**
 * Events by id, at most `ARRAY_MAX` (a row's version before an update); ids outside the Case are
 * left out.
 */
export const getMany = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/events/by-ids",
    summary: "Get events by id",
    tags: ["events"],
  })
  .input(getEventsInputSchema)
  .output(boundedListSchema(eventSchema, ARRAY_MAX))
  .handler(async ({ input, context }) =>
    runApp(
      getEventsByIdsEffect(
        input.caseId,
        context.actor.organizationId,
        input.ids
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
