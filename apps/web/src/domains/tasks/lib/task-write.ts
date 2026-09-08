import { dueDateToIso } from "@/domains/tasks/lib/due-date";
import type { TaskFormValues } from "@/domains/tasks/lib/task-form";
import {
  createTaskInputSchema,
  updateTaskInputSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/domains/tasks/types";
import type { TaskStatus } from "@watchdog/schemas";

function taskPriorityFromForm(
  priority: TaskFormValues["priority"]
): CreateTaskInput["priority"] {
  return priority === "" ? null : priority;
}

/** Normalize task create payloads from the board form. */
export function buildCreateTaskData(
  caseId: string,
  values: TaskFormValues,
  opts?: { entityId?: string | null }
): CreateTaskInput {
  return createTaskInputSchema.parse({
    caseId,
    title: values.title,
    description: values.description,
    status: values.status,
    priority: taskPriorityFromForm(values.priority),
    dueDate: dueDateToIso(values.dueDate),
    entityId: opts?.entityId === undefined ? values.entityId : opts.entityId,
  });
}

/** Normalize task update payloads from the board form. */
export function buildUpdateTaskData(
  caseId: string,
  taskId: string,
  values: TaskFormValues
): UpdateTaskInput {
  return updateTaskInputSchema.parse({
    caseId,
    taskId,
    title: values.title,
    description: values.description,
    status: values.status,
    priority: taskPriorityFromForm(values.priority),
    dueDate: dueDateToIso(values.dueDate),
    entityId: values.entityId,
  });
}

/** Status-only board drag update. */
export function buildTaskStatusUpdateData(
  caseId: string,
  taskId: string,
  status: TaskStatus
): UpdateTaskInput {
  return updateTaskInputSchema.parse({ caseId, taskId, status });
}
