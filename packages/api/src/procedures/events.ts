import { z } from "zod";

import {
  createEventEffect,
  deleteEventEffect,
  listEventsForEntityEffect,
  updateEventEffect,
} from "@watchdog/core";

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
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
    })
  )
  .output(z.array(eventSchema))
  .handler(async ({ input }) =>
    runApp(listEventsForEntityEffect(input.caseId, input.entityId))
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{entityId}/events",
    summary: "Create a timeline event",
    tags: ["events"],
    successStatus: 201,
  })
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
      when: z.string().min(1),
      what: z.string().min(1),
      where: z.string().optional(),
      userOverride: userOverrideSchema,
    })
  )
  .output(eventSchema)
  .handler(async ({ input }) => runApp(createEventEffect(input)));

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/events/{eventId}",
    summary: "Update a timeline event",
    tags: ["events"],
  })
  .input(
    z
      .object({
        caseId: z.uuid(),
        eventId: z.uuid(),
        when: z.string().min(1).optional(),
        what: z.string().min(1).optional(),
        where: z.string().optional(),
        userOverride: userOverrideSchema,
      })
      .refine(
        (data) =>
          data.when !== undefined ||
          data.what !== undefined ||
          data.where !== undefined,
        { message: "At least one field is required" }
      )
  )
  .output(eventSchema)
  .handler(async ({ input }) => runApp(updateEventEffect(input)));

export const remove = graphChildWrite
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/events/{eventId}",
    summary: "Delete a timeline event",
    tags: ["events"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      eventId: z.uuid(),
      userOverride: userOverrideSchema,
    })
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input }) => {
    await runApp(deleteEventEffect(input.caseId, input.eventId));
    return { ok: true as const };
  });
