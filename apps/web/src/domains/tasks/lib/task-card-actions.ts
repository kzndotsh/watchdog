import type { TaskRecord } from "@/domains/tasks/types";
import type { AppAction } from "@/shared/lib/app-action";

export interface TaskCardActionHandlers {
  onOpen: (task: TaskRecord) => void;
  onDelete: (task: TaskRecord) => void;
}

/** Shared ⋯ + ContextMenu actions for task board cards. */
export function taskCardActions(
  task: TaskRecord,
  handlers: TaskCardActionHandlers
): AppAction[] {
  return [
    {
      id: "task-open",
      label: "Open",
      group: "target",
      run: () => {
        handlers.onOpen(task);
      },
    },
    {
      id: "task-delete",
      label: "Delete",
      group: "target",
      destructive: true,
      run: () => {
        handlers.onDelete(task);
      },
    },
  ];
}
