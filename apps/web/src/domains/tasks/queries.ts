import { queryOptions } from "@tanstack/react-query";

import { localDayStartIso } from "@/domains/cases/lib/case-counts";
import type { TaskListItem } from "@/domains/tasks/types";
import { orpc } from "@/lib/orpc-client";
import { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";
import { listView } from "@/shared/lib/list/list-view";
import { orpcKeyInputField } from "@/shared/lib/orpc-key-input";
import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeOptionalUuid,
} from "@/shared/lib/query-ingress";
import {
  placeholderDataForQueryKey,
  placeholderDataForScope,
} from "@/shared/lib/query-placeholder";
import {
  GC_DEFAULT,
  GC_REALTIME,
  STALE_DEFAULT,
  STALE_REALTIME,
} from "@/shared/lib/query-stale";
import { taskList, type TaskBoardInput } from "@watchdog/domain/schemas/feed";
import type { ListQuery } from "@watchdog/domain/schemas/shared";

type TaskListScope = { readonly caseId: string };

/** The board's view: the Task list's filters and search (never its `status` or sort). */
export type TaskBoardView = Omit<TaskBoardInput, "caseId">;

/** The board's input for a view: priorities in one order, so equal views share one entry. */
function taskBoardInput(caseId: string, view: TaskBoardView) {
  return {
    ...view,
    ...(view.priority === undefined
      ? {}
      : { priority: [...view.priority].sort() }),
    caseId: scopeCaseId(caseId),
  };
}

/**
 * Tasks keys are the oRPC procedure keys: `all(caseId)` is `[["tasks"], { input: { caseId } }]`,
 * which mutations and the activity binding invalidate: the board (`tasks.board`), the Task list's
 * views (`tasks.list`), one Task by id (`tasks.get`) and the due list (`tasks.due`).
 */
export const tasksKeys = {
  all: (caseId: string) => orpc.tasks.key({ input: { caseId } }),
  boards: (caseId: string) => orpc.tasks.board.key({ input: { caseId } }),
  board: (caseId: string, view: TaskBoardView) =>
    orpc.tasks.board.queryKey({ input: taskBoardInput(caseId, view) }),
  byId: (caseId: string, taskId: string) =>
    orpc.tasks.get.queryKey({ input: { caseId, taskId } }),
  due: (caseId: string, dayStart: string) =>
    orpc.tasks.due.queryKey({ input: { caseId, dayStart } }),
};

const TASK_BOARD_PATH = JSON.stringify(["tasks", "board"]);

/** The board's view of a Task list query: its `entityId`, `priority` and `q` (fixed ones included). */
export function taskBoardViewOf(
  query: ListQuery<typeof taskList>
): TaskBoardView {
  const { entityId, priority } = query.filters;
  return {
    ...(entityId === null ? {} : { entityId }),
    ...(priority.length === 0 ? {} : { priority: [...priority] }),
    ...(query.q === null ? {} : { q: query.q }),
  };
}

/**
 * The board's open columns (`tasks.board`): one capped read, never a page walk. A new filter or
 * search keeps the previous board (de-emphasised) until its own lands; another Case never lends
 * its cards.
 */
export const taskBoardQuery = (caseId: string, view: TaskBoardView) => {
  const scopedCaseId = scopeCaseId(caseId);
  return queryOptions({
    queryKey: tasksKeys.board(scopedCaseId, view),
    queryFn: async () =>
      orpc.tasks.board.call(taskBoardInput(scopedCaseId, view)),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForScope((previous) => {
      const key = previous?.queryKey;
      return (
        JSON.stringify(key?.[0]) === TASK_BOARD_PATH &&
        orpcKeyInputField(key, "caseId") === scopedCaseId
      );
    }),
  });
};

/** The Task list (ADR-0007): the board's Done and Dropped columns, each with `status` fixed. */
export const taskListView = listView(taskList, {
  procedure: orpc.tasks.list,
  scopeInput: ({ caseId }: TaskListScope) => ({ caseId: scopeCaseId(caseId) }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: TaskListItem) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/**
 * One Task by id, for a `?taskId=` link to a card the board has not loaded (a Done card past the
 * first page); null when the Case no longer holds it. Never runs without an id.
 */
export const taskByIdQuery = (caseId: string, taskId: string | null) => {
  const scopedCaseId = scopeCaseId(caseId);
  const scopedTaskId = scopeOptionalUuid(taskId);
  return queryOptions({
    queryKey: tasksKeys.byId(scopedCaseId, scopedTaskId ?? ""),
    queryFn: async () =>
      orpcNullIfNotFound(
        orpc.tasks.get.call({
          caseId: scopedCaseId,
          taskId: scopedTaskId ?? "",
        })
      ),
    enabled: scopedTaskId !== undefined && scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};

/**
 * The Dashboard's due list (`tasks.due`): one small read of the open Tasks overdue or due soon,
 * never the board or the whole list. `dayStart` is the browser's day, as for `caseCountsQuery`,
 * so the list and the tiles agree on "overdue".
 */
export const dueTasksQuery = (
  caseId: string,
  dayStart = localDayStartIso()
) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = tasksKeys.due(scopedCaseId, dayStart);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      orpc.tasks.due.call({ caseId: scopedCaseId, dayStart }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
