import { createServerFn } from "@tanstack/react-start";

import type { EventRecord } from "@/domains/entities/events/types";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  createEventInputSchema,
  eventList,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

export type { EventRecord } from "@/domains/entities/events/types";

/**
 * One page of the Case's Event list (`eventList`, ADR-0007): the declared filters, `q`, sort and
 * cursor pass through whole. One Entity's Events are this list with `entityId` set.
 */
export const listEventsPageFn = createServerFn({ method: "GET" })
  .validator(eventList.input)
  .handler(async ({ data, context }): Promise<ListPage<EventRecord>> =>
    orpcFromContext(context).events.list(data)
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
