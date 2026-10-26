import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, type MouseEvent, type PointerEvent } from "react";

import { TaskCardBody } from "@/domains/tasks/components/task-card-body";
import { isTaskDueOverdue } from "@/domains/tasks/lib/due-date";
import { taskCardActions } from "@/domains/tasks/lib/task-card-actions";
import type { TaskListItem, TaskRecord } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { filterActionsForSurface } from "@/shared/lib/app-action";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { TASK_CARD_SHELL_CLASS } from "@/shared/ui/task-board-shell";

type Props = {
  task: TaskListItem;
  isSelected?: boolean;
  onSelect: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void;
  isDragDisabled?: boolean;
};

export function TaskCard({
  task,
  isSelected,
  onSelect,
  onDelete,
  isDragDisabled,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isDragDisabled,
    data: { type: "task", status: task.status },
    animateLayoutChanges: () => false,
  });

  const isDone = task.status === "done";
  const entity = task.entity ?? undefined;
  const overdue = isTaskDueOverdue(task.dueDate, task.status);

  const actions = useMemo(
    () =>
      onDelete
        ? taskCardActions(task, {
            onOpen: onSelect,
            onDelete,
          })
        : [],
    [onDelete, onSelect, task]
  );
  const dropdownActions = filterActionsForSurface(actions, "dropdown");

  const shellClassName = cn(
    TASK_CARD_SHELL_CLASS,
    "group text-left",
    !isDragging && "overflow-hidden",
    isSelected && !isDragging && "ring-foreground/25 ring-1",
    isDragging && "border-primary/70 bg-primary/5 border-dashed shadow-none",
    isDone && !isDragging && "opacity-80"
  );

  const shellStyle = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  function handleSelectFromCard() {
    onSelect(task);
  }

  // The card is a real button laid over its content (a button cannot contain the ⋯ menu's
  // button): it names the card, takes the click and is the dnd-kit drag handle. Enter
  // activates it natively; on the board the KeyboardSensor lifts the card on Space only
  // (see `keyboardCodes` in task-board.tsx).
  const inner = (
    <>
      <button
        ref={setActivatorNodeRef}
        type="button"
        title={task.title}
        aria-label={task.title}
        className="focus-visible:ring-ring/50 absolute inset-0 cursor-grab touch-none rounded-md focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset active:cursor-grabbing"
        onClick={handleSelectFromCard}
        {...attributes}
        {...listeners}
      />
      <div className={cn("min-w-0 flex-1", isDragging && "invisible")}>
        <TaskCardBody task={task} entity={entity} isOverdue={overdue} />
        {dropdownActions.length > 0 && !isDragging ? (
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stop ⋯ pointer from selecting/dragging the card
          <div
            className="absolute top-1 right-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
              event.stopPropagation();
            }}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              event.stopPropagation();
            }}
          >
            <RowActionsMenu label="Task actions" actions={dropdownActions} />
          </div>
        ) : null}
      </div>
    </>
  );

  if (actions.length > 0) {
    return (
      <ActionsContextMenu
        actions={actions}
        trigger={
          <div ref={setNodeRef} style={shellStyle} className={shellClassName} />
        }
      >
        {inner}
      </ActionsContextMenu>
    );
  }

  return (
    <div ref={setNodeRef} style={shellStyle} className={shellClassName}>
      {inner}
    </div>
  );
}
