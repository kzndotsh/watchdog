import { CalendarIcon } from "lucide-react";

import type { TaskEntityLabel, TaskRecord } from "@/domains/tasks/types";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/shared/ui/eyebrow";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import {
  EntityKindIcon,
  TASK_PRIORITY_TONE_MAP,
  taskPriorityShortLabel,
} from "@/shared/ui/vocab";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import { entityDisplayLabel } from "@watchdog/schemas/shared";

export function TaskCardBody({
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
            <Eyebrow
              tone="inherit"
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm px-1 py-px leading-none font-normal",
                STATUS_TONES[TASK_PRIORITY_TONE_MAP[task.priority]].low
              )}
            >
              {taskPriorityShortLabel(task.priority)}
            </Eyebrow>
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
