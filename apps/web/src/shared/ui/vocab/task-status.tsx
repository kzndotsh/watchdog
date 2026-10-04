import type { ComponentProps } from "react";

import { Chip } from "@/shared/ui/chip";
import { STATUS_TONES } from "@/shared/ui/vocab/status.lib";
import { TASK_STATUS_TONE_MAP } from "@/shared/ui/vocab/task-status.lib";
import { TASK_STATUS_LABELS } from "@watchdog/schemas/shared";
import type { TaskStatus } from "@watchdog/schemas/shared";

type TaskStatusBadgeProps = Omit<
  ComponentProps<typeof Chip>,
  "label" | "tone"
> & {
  status: TaskStatus;
};

export function TaskStatusBadge({
  status,
  contrast = "low",
  className,
  children,
  ...props
}: TaskStatusBadgeProps) {
  return (
    <Chip
      label={TASK_STATUS_LABELS[status]}
      tone={STATUS_TONES[TASK_STATUS_TONE_MAP[status]]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}
