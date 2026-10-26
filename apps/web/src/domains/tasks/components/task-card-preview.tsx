import { TaskCardBody } from "@/domains/tasks/components/task-card-body";
import { isTaskDueOverdue } from "@/domains/tasks/lib/due-date";
import type { TaskListItem } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { TASK_CARD_SHELL_CLASS } from "@/shared/ui/task-board-shell";

export function TaskCardPreview({ task }: { task: TaskListItem }) {
  const entity = task.entity ?? undefined;
  const overdue = isTaskDueOverdue(task.dueDate, task.status);

  return (
    <div className={cn(TASK_CARD_SHELL_CLASS, "cursor-grabbing")}>
      <TaskCardBody task={task} entity={entity} isOverdue={overdue} />
    </div>
  );
}
