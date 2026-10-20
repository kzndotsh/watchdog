import { createServerFn } from "@tanstack/react-start";

import type { EventRecord } from "@/domains/entities/events/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  createEventInputSchema,
  entityScopeInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas/graph";

export type { EventRecord } from "@/domains/entities/events/types";

export const listEventsFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<EventRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).events.list({
        caseId: data.caseId,
        entityId: data.entityId,
        ...page,
      })
    )
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
