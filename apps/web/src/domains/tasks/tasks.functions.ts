import { createServerFn } from "@tanstack/react-start";

import type {
  TaskBoardRecord,
  TaskListItem,
  TaskRecord,
} from "@/domains/tasks/types";
import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";
import {
  taskBoardInputSchema,
  taskCreateInputSchema as createTaskInputSchema,
  taskDeleteInputSchema as deleteTaskInputSchema,
  taskIdInputSchema,
  taskList,
  taskReorderInputSchema as reorderTasksInputSchema,
  taskUpdateInputSchema as updateTaskInputSchema,
} from "@watchdog/schemas/feed";
import type { ListPage } from "@watchdog/schemas/shared";

/** One page of the Task list (the board's Done and Dropped columns). */
export const listTasksPageFn = createServerFn({ method: "GET" })
  .validator(taskList.input)
  .handler(async ({ data, context }): Promise<ListPage<TaskListItem>> =>
    orpcFromContext(context).tasks.list(data)
  );

/** The board's open columns: every open card the view admits, capped (`isTruncated`). */
export const getTaskBoardFn = createServerFn({ method: "GET" })
  .validator(taskBoardInputSchema)
  .handler(async ({ data, context }): Promise<TaskBoardRecord> =>
    orpcFromContext(context).tasks.board(data)
  );

/** One Task of the Case (a `?taskId=` link to a card the board has not loaded); null when gone. */
export const getTaskFn = createServerFn({ method: "GET" })
  .validator(taskIdInputSchema)
  .handler(async ({ data, context }): Promise<TaskRecord | null> =>
    orpcNullIfNotFound(orpcFromContext(context).tasks.get(data))
  );

export const createTaskFn = createServerFn({ method: "POST" })
  .validator(createTaskInputSchema)
  .handler(async ({ data, context }): Promise<TaskRecord> =>
    orpcFromContext(context).tasks.create(data)
  );

export const updateTaskFn = createServerFn({ method: "POST" })
  .validator(updateTaskInputSchema)
  .handler(async ({ data, context }): Promise<TaskRecord> =>
    orpcFromContext(context).tasks.update(data)
  );

export const deleteTaskFn = createServerFn({ method: "POST" })
  .validator(deleteTaskInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> =>
    orpcFromContext(context).tasks.remove(data)
  );

export const reorderTasksFn = createServerFn({ method: "POST" })
  .validator(reorderTasksInputSchema)
  .handler(async ({ data, context }): Promise<TaskRecord[]> =>
    orpcFromContext(context).tasks.reorder(data)
  );
