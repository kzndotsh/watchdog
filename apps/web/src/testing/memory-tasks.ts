import type { TaskBoardRecord, TaskListItem } from "@/domains/tasks/types";
import {
  matchesChoice,
  matchesQ,
  memoryListPage,
  type ListPageData,
} from "@/testing/memory-list";
import { TASK_BOARD_MAX } from "@watchdog/schemas/feed";
import { isOpenTaskStatus } from "@watchdog/schemas/shared";

/** The Task list's filters and `q` (title, description) as the server reads them. */
function matchesTaskView(row: TaskListItem, data: ListPageData): boolean {
  return (
    matchesChoice(row.status, data.status) &&
    (row.priority === null
      ? !Array.isArray(data.priority) || data.priority.length === 0
      : matchesChoice(row.priority, data.priority)) &&
    (typeof data.entityId !== "string" || row.entityId === data.entityId) &&
    matchesQ(data, [row.title, row.description])
  );
}

function compareTasks(sort: string | undefined) {
  const [key = "updated", dir = "desc"] = (sort ?? "updated.desc").split(".");
  const sign = dir === "asc" ? 1 : -1;
  return (a: TaskListItem, b: TaskListItem): number => {
    if (key === "title") return sign * a.title.localeCompare(b.title);
    if (key === "position") return sign * (a.position - b.position);
    return sign * a.updatedAt.localeCompare(b.updatedAt);
  };
}

/**
 * The Tasks reads on in-memory rows, for board screen tests (`vi.fn(...)` behind the mocked
 * `tasks.functions`): `listTasksPageFn` (the Task list, a page at a time) and `getTaskBoardFn`
 * (the open cards of the view, by position, capped at `cap`).
 */
export function memoryTasks(
  rows: readonly TaskListItem[],
  { pageSize = 50, cap = TASK_BOARD_MAX } = {}
) {
  return {
    listPage: memoryListPage(rows, {
      matches: matchesTaskView,
      compare: compareTasks,
      pageSize,
    }),
    board: async ({
      data,
    }: {
      data: ListPageData;
    }): Promise<TaskBoardRecord> => {
      const open = rows
        .filter(
          (row) => isOpenTaskStatus(row.status) && matchesTaskView(row, data)
        )
        .sort(compareTasks("position.asc"));
      return { items: open.slice(0, cap), isTruncated: open.length > cap };
    },
  };
}
