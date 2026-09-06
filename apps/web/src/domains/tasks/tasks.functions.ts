import { createServerFn } from "@tanstack/react-start";

import {
  createTaskInputSchema,
  deleteTaskInputSchema,
  reorderTasksInputSchema,
  taskFiltersSchema,
  updateTaskInputSchema,
  type TaskRecord,
} from "@/domains/tasks/types";
import { orpcFromContext } from "@/lib/orpc.server";

export const listTasksFn = createServerFn({ method: "GET" })
  .validator(taskFiltersSchema)
  .handler(async ({ data, context }): Promise<TaskRecord[]> =>
    orpcFromContext(context).tasks.list(data)
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
