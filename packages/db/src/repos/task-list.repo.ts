import { eq, inArray } from "drizzle-orm";

import { taskList } from "@watchdog/schemas/feed";

import { entities } from "../schema/entities";
import { tasks } from "../schema/tasks";
import { defineListRepo } from "./_list-query";
import { taskColumns } from "./tasks.repo";

/**
 * The Case's Task list (`taskList`, ADR-0007): the board's Done and Dropped columns, the Dossier
 * tab (`entityId` fixed) and, under the `position` sort with a cap, the board's open columns
 * (`tasks.board`). Each row carries its Entity's label (a display join, never sorted or searched),
 * so a card never reads the Case's Entities.
 */
export const taskListRepo = defineListRepo(taskList, {
  table: tasks,
  base: (exec, listKey) =>
    exec
      .select({
        ...taskColumns,
        entity: {
          id: entities.id,
          name: entities.name,
          slug: entities.slug,
          kind: entities.kind,
        },
        listKey,
      })
      .from(tasks)
      .leftJoin(entities, eq(tasks.entityId, entities.id))
      .$dynamic(),
  id: tasks.id,
  scopeColumn: tasks.caseId,
  scope: ({ caseId }) => eq(tasks.caseId, caseId),
  filters: {
    status: (statuses) =>
      statuses.length > 0 ? inArray(tasks.status, [...statuses]) : undefined,
    priority: (priorities) =>
      priorities.length > 0
        ? inArray(tasks.priority, [...priorities])
        : undefined,
    entityId: (id) => (id === null ? undefined : eq(tasks.entityId, id)),
  },
  // `tasks_case_status_updated_idx (case_id, status, updated_at desc, id desc)` and
  // `tasks_entity_updated_idx (entity_id, updated_at desc, id desc)`
  selective: { status: tasks.status, entityId: tasks.entityId },
  sorts: {
    updated: tasks.updatedAt,
    title: tasks.title,
    position: tasks.position,
  },
  searchLabels: { status: tasks.status },
  search: { title: tasks.title, description: tasks.description },
});

/** A row of the Task list: the Task, its Entity's label (or null), and its cursor value. */
export type TaskListRow = Awaited<ReturnType<typeof taskListRepo.page>>[number];
