import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon, GripVerticalIcon } from "lucide-react";
import {
  useMemo,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { isTaskDueOverdue } from "@/domains/tasks/lib/due-date";
import { taskCardActions } from "@/domains/tasks/lib/task-card-actions";
import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { filterActionsForSurface } from "@/shared/lib/app-action";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { TASK_CARD_SHELL_CLASS } from "@/shared/ui/task-board-shell";
import {
  TASK_PRIORITY_TONE_MAP,
  KindBadge,
  taskPriorityLabel,
} from "@/shared/ui/vocab";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import type { TaskPriority } from "@watchdog/schemas";

interface Props {
  task: TaskRecord;
  selected?: boolean;
  onSelect: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void;
  entityById?: Map<string, TaskEntityLabel>;
  dragDisabled?: boolean;
}

function priorityRailClass(priority: TaskPriority): string {
  switch (priority) {
    case "urgent": {
      return "bg-status-failed";
    }
    case "high": {
      return "bg-status-pending";
    }
    case "medium": {
      return "bg-status-running";
    }
    case "low": {
      return "bg-status-unknown";
    }
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

function TaskCardBody({
  task,
  entity,
  overdue,
}: {
  task: TaskRecord;
  entity?: TaskEntityLabel;
  overdue: boolean;
}) {
  const done = task.status === "done";
  const dropped = task.status === "dropped";
  const hasFooter = Boolean(entity) || Boolean(task.dueDate);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "min-w-0 flex-1 text-sm leading-snug font-medium",
            done && "text-muted-foreground line-through",
            dropped && "text-muted-foreground"
          )}
        >
          {task.title}
        </div>
        {task.priority ? (
          <span
            className={cn(
              "mt-0.5 inline-flex shrink-0 items-center rounded-sm px-1 py-px text-[0.65rem] leading-none font-medium tracking-wide uppercase",
              STATUS_TONES[TASK_PRIORITY_TONE_MAP[task.priority]].low
            )}
          >
            {taskPriorityLabel(task.priority)}
          </span>
        ) : null}
      </div>

      {hasFooter ? (
        <div
          className={cn(
            "mt-2 flex items-center gap-2",
            entity ? "justify-between" : "justify-end"
          )}
        >
          {entity ? (
            <KindBadge
              kind={entity.kind}
              size="sm"
              className="max-w-[10rem] min-w-0"
              title={entity.name}
            >
              <span className="truncate">{entity.name}</span>
            </KindBadge>
          ) : null}

          {task.dueDate ? (
            <span
              className={cn(
                "text-label-mono-sm inline-flex shrink-0 items-center gap-1 tabular-nums",
                overdue ? "text-destructive" : "text-muted-foreground"
              )}
            >
              <CalendarIcon className="size-3 opacity-70" aria-hidden />
              <LocalDateTime value={task.dueDate} dateOnly />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TaskCard({
  task,
  selected,
  onSelect,
  onDelete,
  entityById,
  dragDisabled,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: dragDisabled,
    data: { type: "task", status: task.status },
    animateLayoutChanges: () => false,
  });

  const done = task.status === "done";
  const entity =
    task.entityId && entityById ? entityById.get(task.entityId) : undefined;
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
    "group cursor-grab touch-none text-left active:cursor-grabbing",
    !isDragging && "overflow-hidden",
    selected && !isDragging && "ring-foreground/25 ring-1",
    isDragging && "border-primary/70 bg-primary/5 border-dashed shadow-none",
    done && !isDragging && "opacity-80"
  );

  const shellStyle = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  function selectFromCard() {
    onSelect(task);
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    selectFromCard();
  }

  const inner = (
    <div
      className={cn("flex min-w-0 flex-1 gap-1.5", isDragging && "invisible")}
    >
      {task.priority ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-0.5",
            priorityRailClass(task.priority)
          )}
        />
      ) : null}
      <span
        aria-hidden
        className="text-muted-foreground mt-0.5 shrink-0 opacity-25 group-hover:opacity-60"
      >
        <GripVerticalIcon className="size-3.5" />
      </span>
      <TaskCardBody task={task} entity={entity} overdue={overdue} />
      {dropdownActions.length > 0 && !isDragging ? (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- stop ⋯ pointer from selecting/dragging the card
        <div
          className="shrink-0 self-start"
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
  );

  if (actions.length > 0) {
    return (
      <ActionsContextMenu
        actions={actions}
        trigger={
          <div
            ref={setNodeRef}
            style={shellStyle}
            className={shellClassName}
            onClick={selectFromCard}
            onKeyDown={onCardKeyDown}
            {...attributes}
            {...listeners}
            role="button"
            tabIndex={0}
            aria-label={task.title}
          />
        }
      >
        {inner}
      </ActionsContextMenu>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={shellStyle}
      className={shellClassName}
      onClick={selectFromCard}
      onKeyDown={onCardKeyDown}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={task.title}
    >
      {inner}
    </div>
  );
}

export function TaskCardPreview({
  task,
  entityById,
}: {
  task: TaskRecord;
  entityById?: Map<string, TaskEntityLabel>;
}) {
  const entity =
    task.entityId && entityById ? entityById.get(task.entityId) : undefined;
  const overdue = isTaskDueOverdue(task.dueDate, task.status);

  return (
    <div className={cn(TASK_CARD_SHELL_CLASS, "cursor-grabbing shadow-md")}>
      {task.priority ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-0.5",
            priorityRailClass(task.priority)
          )}
        />
      ) : null}
      <span
        aria-hidden
        className="text-muted-foreground mt-0.5 shrink-0 opacity-60"
      >
        <GripVerticalIcon className="size-3.5" />
      </span>
      <TaskCardBody task={task} entity={entity} overdue={overdue} />
    </div>
  );
}
