import { createServerFn } from "@tanstack/react-start";

import {
  createEventInputSchema,
  entityScopeInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
  type EventRecord,
} from "@/domains/entities/events/types";
import { orpcFromContext } from "@/lib/orpc.server";

export type { EventRecord } from "@/domains/entities/events/types";

export const listEventsFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<EventRecord[]> =>
    orpcFromContext(context).events.list({
      caseId: data.caseId,
      entityId: data.entityId,
    })
  );

export const createEventFn = createServerFn({ method: "POST" })
  .validator(createEventInputSchema)
  .handler(async ({ data, context }): Promise<EventRecord> =>
    orpcFromContext(context).events.create(data)
  );

export const deleteEventFn = createServerFn({ method: "POST" })
  .validator(eventScopeInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).events.delete({
      caseId: data.caseId,
      eventId: data.eventId,
    });
  });

export const updateEventFn = createServerFn({ method: "POST" })
  .validator(updateEventInputSchema)
  .handler(async ({ data, context }): Promise<EventRecord> =>
    orpcFromContext(context).events.update(data)
  );
