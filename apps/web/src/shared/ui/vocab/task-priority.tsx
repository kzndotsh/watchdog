import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import { TASK_PRIORITY_TONE_MAP } from "@/shared/ui/vocab/task-priority.lib";
import { TASK_PRIORITY_LABELS } from "@watchdog/schemas/shared";
import type { TaskPriority } from "@watchdog/schemas/shared";

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
      className={cn("font-normal", className)}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}
