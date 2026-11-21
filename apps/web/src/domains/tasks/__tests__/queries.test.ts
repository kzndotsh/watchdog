import { ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  taskBoardQuery,
  taskBoardViewOf,
  taskByIdQuery,
  tasksKeys,
} from "@/domains/tasks/queries";
import type { TaskBoardRecord } from "@/domains/tasks/types";
import { procedureDouble } from "@/testing/orpc-client";
import { placeholderFor } from "@/testing/query-placeholder";
import { taskList } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const getTask = procedureDouble("tasks.get");
const board = procedureDouble("tasks.board");

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

  it("reads one Task by its Case and id, and a NOT_FOUND as null", async () => {
    getTask.mockRejectedValueOnce(new ORPCError("NOT_FOUND"));
    await expect(
      new QueryClient().query(taskByIdQuery(CASE, testId(3)))
    ).resolves.toBeNull();
    expect(getTask).toHaveBeenLastCalledWith({
      caseId: CASE,
      taskId: testId(3),
    });
  });

  it("rethrows any other failure of a Task read", async () => {
    getTask.mockRejectedValueOnce(new Error("db down"));
    await expect(
      new QueryClient().query({
        ...taskByIdQuery(CASE, testId(3)),
        retry: false,
      })
    ).rejects.toThrow("db down");
  });

  it("sends the board's view and Case to tasks.board", async () => {
    board.mockResolvedValueOnce({ items: [], isTruncated: false });
    await new QueryClient().query(
      taskBoardQuery(CASE, { priority: ["low", "high"], q: "dns" })
    );
    expect(board).toHaveBeenLastCalledWith({
      caseId: CASE,
      priority: ["high", "low"],
      q: "dns",
    });
  });
});
