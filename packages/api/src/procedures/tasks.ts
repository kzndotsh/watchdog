import { z } from "zod";

import {
  createTaskEffect,
  deleteTaskEffect,
  getTaskInCaseEffect,
  listTasksForCaseEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import {
  taskCreateInputSchema,
  taskDeleteInputSchema,
  taskFiltersSchema,
  taskIdInputSchema,
  taskReorderInputSchema,
  taskUpdateInputSchema,
  taskSchema,
} from "@watchdog/schemas/feed";

import { graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";

export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/tasks",
    summary: "List tasks for a case",
    tags: ["tasks"],
  })
  .input(taskFiltersSchema)
  .output(taskSchema.array())
  .handler(async ({ input, context }) =>
    runApp(
      listTasksForCaseEffect(input.caseId, context.actor.organizationId, {
        entityId: input.entityId,
        status: input.status,
        unattachedOnly: input.unattachedOnly,
      })
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
    summary: "Rewrite task order within a status column",
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
