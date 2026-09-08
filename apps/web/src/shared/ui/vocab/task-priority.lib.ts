import type { DisplayStatus } from "@/shared/ui/vocab/status.lib";
import { optionsFromLabels } from "@/shared/ui/vocab/title-case";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskPriority,
} from "@watchdog/schemas";

/** Map priorities onto existing `--status-*` token tones. */
export const TASK_PRIORITY_TONE_MAP: Record<TaskPriority, DisplayStatus> = {
  urgent: "failed",
  high: "pending",
  medium: "running",
  low: "unknown",
};

export const TASK_PRIORITY_OPTIONS = optionsFromLabels(
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS
);

export function taskPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_LABELS[priority];
}

export { TASK_PRIORITY_LABELS };
