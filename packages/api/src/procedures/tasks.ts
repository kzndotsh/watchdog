import { z } from "zod";

import {
  createTaskEffect,
  deleteTaskEffect,
  getTaskBoardEffect,
  listDueTasksEffect,
  getTaskInCaseEffect,
  listTasksForCaseEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import { caseCountsInputSchema } from "@watchdog/schemas/cases";
import {
  dueTasksSchema,
  taskCreateInputSchema,
  taskBoardInputSchema,
  taskBoardSchema,
  taskDeleteInputSchema,
  taskIdInputSchema,
  taskList,
  taskListItemSchema,
  taskReorderInputSchema,
  taskUpdateInputSchema,
  taskSchema,
} from "@watchdog/schemas/feed";
import { listPageSchema } from "@watchdog/schemas/shared";

import { graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";

/**
 * The Case's Task list (`taskList`, ADR-0007): `status`, `priority` and `entityId` filters, `q`
 * and sort, a page at a time with `total` on the first page. The board reads its Done and
 * Dropped columns here; its open columns come from `board`.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/tasks",
    summary: "List tasks for a case",
    tags: ["tasks"],
  })
  .input(taskList.input)
  .output(listPageSchema(taskListItemSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listTasksForCaseEffect(input.caseId, context.actor.organizationId, input)
    )
  );

/**
 * The board's open columns: every open Task the list's filters and search admit, in board order,
 * at most `TASK_BOARD_MAX`, with `isTruncated` past it. Not paged: drag and drop needs whole
 * columns. Under `/task-board`, not `/tasks/board`, which `get` would read as a Task id.
 */
export const board = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/task-board",
    summary: "Get the open tasks of a case for its board",
    tags: ["tasks"],
  })
  .input(taskBoardInputSchema)
  .output(taskBoardSchema)
  .handler(async ({ input, context }) => {
    const { caseId, ...filters } = input;
    return runApp(
      getTaskBoardEffect(caseId, context.actor.organizationId, filters)
    );
  });

/**
 * The Dashboard's due list: open Tasks overdue or due soon (the `cases.counts` window, from the
 * caller's `dayStart`), soonest first, at most `TASK_DUE_LIST_LIMIT`, with their capped total.
 * Not the board: a due Task past the board's cap still shows.
 */
export const due = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/tasks-due",
    summary:
      "The open tasks of a case that are overdue or due soon, soonest first (at most 8), and how many there are (capped at 1000); dayStart is the start of the caller's day (default: the server's UTC day)",
    tags: ["tasks"],
  })
  .input(caseCountsInputSchema)
  .output(dueTasksSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listDueTasksEffect(
        input.caseId,
        context.actor.organizationId,
        input.dayStart === undefined
          ? {}
          : { dayStart: new Date(input.dayStart) }
      )
    )
  );

export const get = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/tasks/{taskId}",
    summary: "Get a task by id",
    tags: ["tasks"],
  })
  .input(taskIdInputSchema)
  .output(taskSchema)
  .handler(async ({ input, context }) =>
    runApp(
      getTaskInCaseEffect(
        input.caseId,
        context.actor.organizationId,
        input.taskId
      )
    )
  );

export const create = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/tasks",
    summary: "Create a task",
    tags: ["tasks"],
    successStatus: 201,
  })
  .input(taskCreateInputSchema)
  .output(taskSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createTaskEffect({
        ...input,
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const update = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/tasks/{taskId}",
    summary: "Update a task",
    tags: ["tasks"],
  })
  .input(taskUpdateInputSchema)
  .output(taskSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateTaskEffect({
        ...input,
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const remove = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/tasks/{taskId}",
    summary: "Delete a task",
    tags: ["tasks"],
  })
  .input(taskDeleteInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteTaskEffect(
        input.caseId,
        context.actor.organizationId,
        input.taskId,
        context.actor.userId,
        graphActorFromContext(context).actorLabel,
        graphActorFromContext(context).actorKeyId
      )
    );
    return { ok: true as const };
  });

export const reorder = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/tasks/reorder",
    summary:
      "Reorder tasks within a status column (the sent tasks take the slots they hold, in the order sent)",
    tags: ["tasks"],
  })
  .input(taskReorderInputSchema)
  .output(taskSchema.array())
  .handler(async ({ input, context }) =>
    runApp(
      reorderTasksEffect({
        ...input,
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );
