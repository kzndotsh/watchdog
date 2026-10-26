import { eq } from "drizzle-orm";

import { eventList } from "@watchdog/schemas/graph";

import { events } from "../schema/events";
import { defineListRepo } from "./_list-query";
import { eventColumns } from "./events.repo";

/**
 * The Case's Event list (`eventList`, ADR-0007): one per Case. An Entity's timeline is this list
 * with `entityId` fixed (the Dossier tab), served by `events_entity_when_idx`.
 */
export const eventListRepo = defineListRepo(eventList, {
  table: events,
  base: (exec, listKey) =>
    exec
      .select({ ...eventColumns, listKey })
      .from(events)
      .$dynamic(),
  id: events.id,
  scopeColumn: events.caseId,
  scope: ({ caseId }) => eq(events.caseId, caseId),
  filters: {
    entityId: (id) => (id === null ? undefined : eq(events.entityId, id)),
  },
  // `events_entity_when_idx (entity_id, when, id)`
  selective: { entityId: events.entityId },
  sorts: { when: events.when, added: events.createdAt },
  search: {
    what: events.what,
    where: events.whereText,
    when: events.when,
  },
});

/** A row of the Event list: the Event and its cursor value. */
export type EventListRow = Awaited<
  ReturnType<typeof eventListRepo.page>
>[number];
