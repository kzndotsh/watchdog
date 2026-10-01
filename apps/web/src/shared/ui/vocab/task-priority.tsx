import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_TONE_MAP,
} from "@/shared/ui/vocab/task-priority.lib";
import type { TaskPriority } from "@watchdog/schemas";

type TaskPriorityBadgeProps = Omit<
  ComponentProps<typeof Chip>,
  "label" | "tone"
> & {
  priority: TaskPriority;
};

export function TaskPriorityBadge({
  priority,
  contrast = "low",
  className,
  children,
  ...props
}: TaskPriorityBadgeProps) {
  return (
    <Chip
      label={TASK_PRIORITY_LABELS[priority]}
      tone={STATUS_TONES[TASK_PRIORITY_TONE_MAP[priority]]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 3,
};

/** Three ascending bars (Linear-style): low = 1 lit, medium = 2, high = 3, urgent = 3 in the failed tone. */
export function TaskPriorityBars({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const rank = PRIORITY_RANK[priority];
  return (
    <span
      role="img"
      aria-label={`${TASK_PRIORITY_LABELS[priority]} priority`}
      title={`${TASK_PRIORITY_LABELS[priority]} priority`}
      className={cn("inline-flex h-3 shrink-0 items-end gap-px", className)}
    >
      {[1, 2, 3].map((bar) => {
        let lit = "bg-foreground/15";
        if (bar <= rank) {
          lit = priority === "urgent" ? "bg-status-failed" : "bg-foreground/70";
        }
        return (
          <span
            key={bar}
            className={cn(
              "w-[3px] rounded-xs",
              bar === 1 && "h-1",
              bar === 2 && "h-2",
              bar === 3 && "h-3",
              lit
            )}
          />
        );
      })}
    </span>
  );
}
