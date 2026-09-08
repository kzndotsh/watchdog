import type { DisplayStatus } from "@/shared/ui/vocab/status.lib";
import { optionsFromLabels } from "@/shared/ui/vocab/title-case";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "@watchdog/schemas";

/** Map task statuses onto existing `--status-*` token tones. */
export const TASK_STATUS_TONE_MAP: Record<TaskStatus, DisplayStatus> = {
  backlog: "pending",
  in_progress: "running",
  blocked: "blocked",
  done: "succeeded",
  dropped: "cancelled",
};

export const TASK_STATUS_OPTIONS = optionsFromLabels(
  TASK_STATUSES,
  TASK_STATUS_LABELS
);

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export { TASK_STATUS_LABELS };
