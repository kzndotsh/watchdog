import { z } from "zod";

import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "./display-labels";
import { entityKindSchema, taskPrioritySchema } from "./enums";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, ref } from "./lists/filter-kinds";
import { listSearchWireSchema } from "./lists/list-page";
import { trimmedUuidSchema, uuidSchema } from "./primitives";
import { taskSchema } from "./tasks";
import { TASK_PRIORITIES, TASK_STATUSES } from "./vocab";

/**
 * The Case's Task list (ADR-0007): the board's finished columns (Done and Dropped, each this
 * list with `status` fixed) and `tasks.list`. An Entity's Tasks are this list with `entityId`
 * fixed (the Dossier tab). The open columns are not paged: the board needs every open card for
 * drag and drop, so they come from `tasks.board`, which reads this list's filters and search
 * under the `position` sort with a cap. `updated.desc` puts the most recently finished first.
 */
export const taskList = defineList({
  name: "tasks",
  noun: { one: "task", many: "tasks" },
  scope: caseScopeInputSchema,
  filters: {
    status: choices("Status", TASK_STATUSES, TASK_STATUS_LABELS),
    priority: choices("Priority", TASK_PRIORITIES, TASK_PRIORITY_LABELS),
    entityId: ref("Entity", "entity"),
  },
  sorts: {
    updated: { label: "Updated", type: "time", dirs: ["desc", "asc"] },
    title: { label: "Title", type: "text", dirs: ["asc", "desc"] },
    position: { label: "Board order", type: "int", dirs: ["asc", "desc"] },
  },
  defaultSort: "updated.desc",
  search: {
    fields: ["title", "description"],
    hint: "title or description",
  },
});

/** The Entity a Task row is about, joined into the row for its card (never a Case-wide read). */
export const taskEntityLabelSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  kind: entityKindSchema,
});

/** A row of the Task list and of the board: the Task and its Entity's label. */
export const taskListItemSchema = taskSchema.extend({
  entity: taskEntityLabelSchema.nullable(),
});

/**
 * The most open Tasks `tasks.board` returns (an `isTruncated` envelope, not a page). It equals a
 * list view's ceiling (`LIST_MAX_PAGES` pages of 50), so the board never holds more cards than a
 * fully loaded list would; past it the board asks to narrow by Entity, priority or search.
 */
export const TASK_BOARD_MAX = 500;

/**
 * `tasks.board`: the Case's open Tasks (`OPEN_TASK_STATUSES`) in board order, narrowed by the
 * Task list's own filters and search (a hand-typed `status` or `sort` is not taken: the board
 * is always the open columns in `position` order).
 */
export const taskBoardInputSchema = caseScopeInputSchema.extend({
  entityId: trimmedUuidSchema.optional(),
  priority: z.array(taskPrioritySchema).max(TASK_PRIORITIES.length).optional(),
  q: listSearchWireSchema,
});
export type TaskBoardInput = z.output<typeof taskBoardInputSchema>;

/**
 * The open Tasks, at most `TASK_BOARD_MAX`, by position then id. `isTruncated` is true when more
 * open Tasks match than the board holds; the board then shows a notice.
 */
export const taskBoardSchema = z.object({
  items: z.array(taskListItemSchema),
  isTruncated: z.boolean(),
});
export type TaskBoard = z.output<typeof taskBoardSchema>;
