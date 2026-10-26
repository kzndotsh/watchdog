import { queryOptions } from "@tanstack/react-query";

import {
  getTaskBoardFn,
  getTaskFn,
  listTasksPageFn,
} from "@/domains/tasks/tasks.functions";
import type { TaskListItem } from "@/domains/tasks/types";
import { listView } from "@/shared/lib/list/list-view";
import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeOptionalUuid,
} from "@/shared/lib/query-ingress";
import { placeholderDataForScope } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { taskList, type TaskBoardInput } from "@watchdog/schemas/feed";
import { OPEN_TASK_STATUSES, type ListQuery } from "@watchdog/schemas/shared";

type TaskListScope = { readonly caseId: string };

/** The board's view: the Task list's filters and search (never its `status` or sort). */
export type TaskBoardView = Omit<TaskBoardInput, "caseId">;

/**
 * Every Tasks key sits under `tasksKeys.all(caseId)`, which mutations and the activity binding
 * invalidate: the board (`board`), the Task list's views (`taskListView`, `[..., "list", ...]`)
 * and one Task by id (`byId`).
 */
export const tasksKeys = {
  all: (caseId: string) => ["tasks", caseId] as const,
  boards: (caseId: string) => ["tasks", caseId, "board"] as const,
  board: (caseId: string, view: TaskBoardView) =>
    [
      "tasks",
      caseId,
      "board",
      // The list's canonical key of the same view, so equal views share one entry.
      taskList.keyOf(
        taskList.queryOf({
          ...view,
          status: OPEN_TASK_STATUSES,
          sort: "position.asc",
        })
      ),
    ] as const,
  byId: (caseId: string, taskId: string) =>
    ["tasks", caseId, "by-id", taskId] as const,
};

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
      getTaskBoardFn({ data: { ...view, caseId: scopedCaseId } }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForScope((previous) => {
      const key = previous?.queryKey;
      return key?.[1] === scopedCaseId && key[2] === "board";
    }),
  });
};

/** The Task list (ADR-0007): the board's Done and Dropped columns, each with `status` fixed. */
export const taskListView = listView(taskList, {
  domain: "tasks",
  scopeKey: ({ caseId }: TaskListScope) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listTasksPageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
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
      getTaskFn({
        data: { caseId: scopedCaseId, taskId: scopedTaskId ?? "" },
      }),
    enabled: scopedTaskId !== undefined && scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};
