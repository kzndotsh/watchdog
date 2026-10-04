import { isoToDateInput } from "@/domains/tasks/lib/due-date";
import type { TaskRecord } from "@/domains/tasks/types";
import type { TaskPriority, TaskStatus } from "@watchdog/schemas/shared";

export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority | "";
  dueDate: string;
  entityId: string;
}

export const EMPTY_TASK_FORM: TaskFormValues = {
  title: "",
  description: "",
  status: "backlog",
  priority: "",
  dueDate: "",
  entityId: "",
};

export function taskFormIssues(v: TaskFormValues): string[] {
  const out: string[] = [];
  if (!v.title.trim()) out.push("Title is required");
  return out;
}

export function defaultsFromTask(task: TaskRecord): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority ?? "",
    dueDate: isoToDateInput(task.dueDate),
    entityId: task.entityId ?? "",
  };
}

export function normalizeTaskForm(values: TaskFormValues): TaskFormValues {
  return {
    ...values,
    title: values.title.trim(),
    description: values.description.trim(),
  };
}
