import type { QueryClient } from "@tanstack/react-query";

import {
  DONE_COLUMN,
  DROPPED_COLUMN,
  type TasksSearch,
} from "@/domains/tasks/lib/tasks-search";
import {
  taskBoardQuery,
  taskBoardViewOf,
  taskListView,
} from "@/domains/tasks/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { taskList } from "@watchdog/schemas/feed";

/**
 * Warm the URL's view of the board without blocking paint: the open columns (one capped read)
 * and the first page of Done and Dropped. Never the Case's Entities: cards carry their label.
 */
export function warmTasksQueries(
  queryClient: QueryClient,
  caseId: string,
  search: TasksSearch
): void {
  const { taskId: _link, ...view } = search;
  const scope = { caseId };
  const doneQuery = taskList.queryOf(view, DONE_COLUMN);
  warmEnsureQueryData(queryClient, {
    ...taskBoardQuery(caseId, taskBoardViewOf(doneQuery)),
    shouldRevalidateIfStale: true,
  });
  taskListView.warm(queryClient, scope, doneQuery);
  taskListView.warm(queryClient, scope, taskList.queryOf(view, DROPPED_COLUMN));
}
