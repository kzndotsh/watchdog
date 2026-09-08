import type { TaskRecord as CoreTaskRecord } from "@watchdog/core";
import type { EntityKind } from "@watchdog/schemas";

export type TaskRecord = CoreTaskRecord;

export interface TaskEntityLabel {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
}

export type {
  CreateTaskInput,
  DeleteTaskInput,
  ReorderTasksInput,
  TaskFiltersInput,
  UpdateTaskInput,
} from "@watchdog/schemas";

export {
  taskCreateInputSchema as createTaskInputSchema,
  taskDeleteInputSchema as deleteTaskInputSchema,
  taskFiltersSchema,
  taskReorderInputSchema as reorderTasksInputSchema,
  taskUpdateInputSchema as updateTaskInputSchema,
} from "@watchdog/schemas";
