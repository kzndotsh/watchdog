import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarIcon } from "lucide-react";
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
  EntityKindIcon,
  TASK_PRIORITY_TONE_MAP,
  taskPriorityShortLabel,
} from "@/shared/ui/vocab";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

interface Props {
  task: TaskRecord;
  selected?: boolean;
  onSelect: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void;
  entityById?: Map<string, TaskEntityLabel>;
  dragDisabled?: boolean;
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
  const hasFooter = Boolean(task.priority) || Boolean(task.dueDate);
  const entityLabel = entity
    ? entityDisplayLabel({ name: entity.name, slug: entity.slug })
    : null;

  return (
    <div className="flex min-w-0 flex-col">
      {entity && entityLabel ? (
        <div className="bg-muted/40 flex h-6 min-w-0 items-center gap-1 px-2.5 pr-7">
          <span
            className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs"
            title={entityLabel}
          >
            <EntityKindIcon kind={entity.kind} size="sm" />
            <span className="truncate">{entityLabel}</span>
          </span>
        </div>
      ) : null}

      {/* Padding lives on the wrapper: line-clamp hides overflow inside its own padding box, so padding on the clamped element lets the third line peek out. */}
      <div className={cn("px-2.5 py-2", !entity && "pr-7")}>
        <div
          title={task.title}
          className={cn(
            "line-clamp-2 text-xs leading-snug font-normal break-words",
            done && "text-muted-foreground line-through",
            dropped && "text-muted-foreground"
          )}
        >
          {task.title}
        </div>
      </div>

      {hasFooter ? (
        <div className="border-border flex h-6 min-w-0 items-center gap-2 border-t px-2.5">
          {task.priority ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm px-1 py-px text-xs leading-none font-normal tracking-wider uppercase",
                STATUS_TONES[TASK_PRIORITY_TONE_MAP[task.priority]].low
              )}
            >
              {taskPriorityShortLabel(task.priority)}
            </span>
          ) : null}
          {task.dueDate ? (
            <span
              className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-xs font-light tabular-nums",
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
    <div className={cn("min-w-0 flex-1", isDragging && "invisible")}>
      <TaskCardBody task={task} entity={entity} overdue={overdue} />
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
    <div className={cn(TASK_CARD_SHELL_CLASS, "cursor-grabbing")}>
      <TaskCardBody task={task} entity={entity} overdue={overdue} />
    </div>
  );
}
