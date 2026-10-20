import {
  eventsRepo,
  type EventPatch,
  type EventRow,
  type NewEvent,
} from "@watchdog/db";

import type { GraphTable } from "./graph-table";

export type EventRecord = {
  id: string;
  entityId: string;
  when: string;
  what: string;
  where: string | null;
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export function toEventRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    when: row.when,
    what: row.what,
    where: row.whereText,
    version: row.version,
  };
}

/** The Graph table descriptors. Only this file calls a Graph repo write (the module's single seam). */
export const eventsTable: GraphTable<
  EventRow,
  EventRecord,
  Omit<NewEvent, "caseId">,
  EventPatch
> = {
  kind: "event",
  entity: "Event",
  label: (row) => row.what,
  toRecord: toEventRecord,
  repo: {
    get: (exec, caseId, id) => eventsRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      eventsRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      eventsRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
    remove: (exec, caseId, id) => eventsRepo.deleteInCase(exec, caseId, id),
  },
};
