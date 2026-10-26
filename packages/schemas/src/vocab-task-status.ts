import type { TaskStatus } from "./vocab";

/** The board's columns: open work, every card of which the board shows (`tasks.board`). */
export const OPEN_TASK_STATUSES = [
  "backlog",
  "in_progress",
  "blocked",
] as const satisfies readonly TaskStatus[];
export type OpenTaskStatus = (typeof OPEN_TASK_STATUSES)[number];

/** Finished work: the complement of {@link OPEN_TASK_STATUSES}, each column a paged list. */
export const CLOSED_TASK_STATUSES = [
  "done",
  "dropped",
] as const satisfies readonly TaskStatus[];
export type ClosedTaskStatus = (typeof CLOSED_TASK_STATUSES)[number];

export function isOpenTaskStatus(status: TaskStatus): status is OpenTaskStatus {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(status);
}
