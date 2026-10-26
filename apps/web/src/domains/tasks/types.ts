import type {
  TaskBoardRecord as CoreTaskBoardRecord,
  TaskEntityLabel as CoreTaskEntityLabel,
  TaskListItem as CoreTaskListItem,
  TaskRecord as CoreTaskRecord,
} from "@watchdog/core/tasks";

export type TaskRecord = CoreTaskRecord;

/** A board card: the Task and its Entity's label, joined on the server. */
export type TaskListItem = CoreTaskListItem;

export type TaskEntityLabel = CoreTaskEntityLabel;

/** `tasks.board`: the open cards, at most `TASK_BOARD_MAX`, and whether more matched. */
export type TaskBoardRecord = CoreTaskBoardRecord;
