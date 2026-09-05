import { z } from "zod";

import {
  createTaskEffect,
  deleteTaskEffect,
  getTaskInCaseEffect,
  listTasksForCaseEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core";
import {
  taskCreateInputSchema,
  taskDeleteInputSchema,
  taskFiltersSchema,
  taskIdInputSchema,
  taskReorderInputSchema,
  taskUpdateInputSchema,
} from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import { taskSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/tasks",
    summary: "List tasks for a case",
    tags: ["tasks"],
  })
  .input(taskFiltersSchema)
  .output(taskSchema.array())
  .handler(async ({ input }) =>
    runApp(
      listTasksForCaseEffect(input.caseId, {
        entityId: input.entityId,
        status: input.status,
        unattachedOnly: input.unattachedOnly,
      })
    )
  );

export const get = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/tasks/{taskId}",
    summary: "Get a task by id",
    tags: ["tasks"],
  })
  .input(taskIdInputSchema)
  .output(taskSchema)
  .handler(async ({ input }) =>
    runApp(getTaskInCaseEffect(input.caseId, input.taskId))
  );

export const create = authed
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
    runApp(createTaskEffect({ ...input, actorId: context.actor.userId }))
  );

export const update = authed
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/tasks/{taskId}",
    summary: "Update a task",
    tags: ["tasks"],
  })
  .input(taskUpdateInputSchema)
  .output(taskSchema)
  .handler(async ({ input, context }) =>
    runApp(updateTaskEffect({ ...input, actorId: context.actor.userId }))
  );

export const remove = authed
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
      deleteTaskEffect(input.caseId, input.taskId, context.actor.userId)
    );
    return { ok: true as const };
  });

export const reorder = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/tasks/reorder",
    summary: "Rewrite task order within a status column",
    tags: ["tasks"],
  })
  .input(taskReorderInputSchema)
  .output(taskSchema.array())
  .handler(async ({ input }) => runApp(reorderTasksEffect(input)));
