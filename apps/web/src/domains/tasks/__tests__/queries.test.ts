import { describe, expect, it, vi } from "vitest";

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
  tasksKeys,
} from "@/domains/tasks/queries";
import type { TaskBoardRecord } from "@/domains/tasks/types";
import { placeholderFor } from "@/testing/query-placeholder";

const CASE = testCaseId(1);
const OTHER_CASE = testCaseId(2);

describe("tasks queries", () => {
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

  it("keeps a board's previous data only within its Case", () => {
    const board = taskBoardQuery(CASE, { q: "dns" });
    const previous: TaskBoardRecord = { items: [], isTruncated: false };

    expect(placeholderFor(board, previous, tasksKeys.board(CASE, {}))).toBe(
      previous
    );
    expect(
      placeholderFor(board, previous, tasksKeys.board(OTHER_CASE, {}))
    ).toBeUndefined();
  });

  it("does not read a board for a Case id that is not a uuid", () => {
    expect(taskBoardQuery("case-1", {}).enabled).toBe(false);
    expect(taskBoardQuery(CASE, {}).enabled).toBe(true);
  });

  it("never reads a Task by id without one", () => {
    expect(taskByIdQuery(CASE, null).enabled).toBe(false);
    expect(taskByIdQuery(CASE, testId(3)).enabled).toBe(true);
  });
});
