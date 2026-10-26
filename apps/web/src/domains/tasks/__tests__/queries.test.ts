import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { taskList } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/tasks/tasks.functions", () => ({
  getTaskBoardFn: vi.fn(),
  getTaskFn: vi.fn(),
  listTasksPageFn: vi.fn(),
}));

import {
  taskBoardQuery,
  taskBoardViewOf,
  taskByIdQuery,
  taskListView,
  tasksKeys,
} from "@/domains/tasks/queries";
import type { TaskBoardRecord } from "@/domains/tasks/types";

const CASE = testCaseId(1);
const OTHER_CASE = testCaseId(2);

describe("tasks queries", () => {
  it("keeps the board, the list views and by-id reads under the Case's root", () => {
    const root = tasksKeys.all(CASE);
    for (const key of [
      tasksKeys.board(CASE, {}),
      taskListView.key({ caseId: CASE }, taskList.queryOf({})),
      tasksKeys.byId(CASE, testId(3)),
    ]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it("keys equal board views alike, whatever their order", () => {
    expect(tasksKeys.board(CASE, { priority: ["low", "high"] })).toEqual(
      tasksKeys.board(CASE, { priority: ["high", "low"] })
    );
    expect(tasksKeys.board(CASE, { q: "dns" })).not.toEqual(
      tasksKeys.board(CASE, {})
    );
  });

  it("reads the board's view from a finished column's query, fixed Entity included", () => {
    const entityId = testId(4);
    expect(
      taskBoardViewOf(
        taskList.queryOf(
          { priority: ["high"], q: "whois", sort: "title.asc" },
          { status: ["done"], entityId }
        )
      )
    ).toEqual({ entityId, priority: ["high"], q: "whois" });
    expect(taskBoardViewOf(taskList.queryOf({}, { status: ["done"] }))).toEqual(
      {}
    );
  });

  it("uses the default tiers and keeps a board only within its Case", () => {
    const board = taskBoardQuery(CASE, { q: "dns" });
    expect(board).toMatchObject({
      enabled: true,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    const placeholder = board.placeholderData;
    if (typeof placeholder !== "function") throw new Error("placeholder");
    const previous = { items: [], isTruncated: false };
    const client = new QueryClient();
    const queryAt = (queryKey: readonly unknown[]) =>
      client
        .getQueryCache()
        .build<TaskBoardRecord, Error, TaskBoardRecord>(client, { queryKey });
    expect(placeholder(previous, queryAt(tasksKeys.board(CASE, {})))).toEqual(
      previous
    );
    expect(
      placeholder(previous, queryAt(tasksKeys.board(OTHER_CASE, {})))
    ).toBeUndefined();
    expect(taskBoardQuery("case-1", {}).enabled).toBe(false);
  });

  it("never reads a Task by id without one", () => {
    expect(taskByIdQuery(CASE, null).enabled).toBe(false);
    expect(taskByIdQuery(CASE, testId(3)).enabled).toBe(true);
  });
});
