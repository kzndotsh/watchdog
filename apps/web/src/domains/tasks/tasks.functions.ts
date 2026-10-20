import { createServerFn } from "@tanstack/react-start";

import type { TaskRecord } from "@/domains/tasks/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  taskCreateInputSchema as createTaskInputSchema,
  taskDeleteInputSchema as deleteTaskInputSchema,
  taskReorderInputSchema as reorderTasksInputSchema,
  taskFiltersSchema,
  taskUpdateInputSchema as updateTaskInputSchema,
} from "@watchdog/schemas/feed";

export const listTasksFn = createServerFn({ method: "GET" })
  .validator(taskFiltersSchema)
  .handler(async ({ data, context }): Promise<TaskRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).tasks.list({
        caseId: data.caseId,
        ...(data.entityId === undefined ? {} : { entityId: data.entityId }),
        ...(data.status === undefined ? {} : { status: data.status }),
        ...(data.unattachedOnly === undefined
          ? {}
          : { unattachedOnly: data.unattachedOnly }),
        ...page,
      })
    )
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
