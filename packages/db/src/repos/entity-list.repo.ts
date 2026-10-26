import { eq, inArray } from "drizzle-orm";

import { entityList } from "@watchdog/schemas/graph";

import { entities } from "../schema/entities";
import { defineListRepo } from "./_list-query";
import { entityColumns } from "./entities.repo";

/**
 * The Case's Entity list (`entityList`, ADR-0007): the server-searched Entity pickers (#559)
 * today, the Entities screen when it moves. Builder API only, like the other list bindings.
 */
export const entityListRepo = defineListRepo(entityList, {
  table: entities,
  base: (exec, listKey) =>
    exec
      .select({ ...entityColumns, listKey })
      .from(entities)
      .$dynamic(),
  id: entities.id,
  scopeColumn: entities.caseId,
  scope: ({ caseId }) => eq(entities.caseId, caseId),
  filters: {
    kind: (kinds) =>
      kinds.length > 0 ? inArray(entities.kind, [...kinds]) : undefined,
  },
  sorts: { name: entities.name, updated: entities.updatedAt },
  searchLabels: { kind: entities.kind },
  search: {
    name: entities.name,
    summary: entities.summary,
    notes: entities.notes,
  },
});

/** A row of the Entity list: the Entity and its cursor value. */
export type EntityListRow = Awaited<
  ReturnType<typeof entityListRepo.page>
>[number];
