import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createTaskFn,
  deleteTaskFn,
  getTaskBoardFn,
  getTaskFn,
  listTasksPageFn,
  reorderTasksFn,
} from "@/domains/tasks/tasks.functions";
import { callServerFn, orpc, orpcNotFound } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);
const TASK_ID = testId(1);

beforeEach(() => orpc.reset());

describe("getTaskFn", () => {
  it("answers null when the Task is gone", async () => {
    orpc.fail("tasks.get", orpcNotFound());

    await expect(
      callServerFn(getTaskFn, { caseId: CASE_ID, taskId: TASK_ID })
    ).resolves.toBeNull();
  });

  it("rethrows any other API failure", async () => {
    orpc.fail("tasks.get", new Error("db down"));

    await expect(
      callServerFn(getTaskFn, { caseId: CASE_ID, taskId: TASK_ID })
    ).rejects.toThrow("db down");
  });
});

describe("input validation", () => {
  it.each([
    ["listTasksPageFn", listTasksPageFn, { caseId: "not-a-uuid" }],
    ["getTaskBoardFn", getTaskBoardFn, { caseId: "not-a-uuid" }],
    ["getTaskFn", getTaskFn, { caseId: CASE_ID, taskId: "not-a-uuid" }],
    ["createTaskFn", createTaskFn, { caseId: CASE_ID, title: "" }],
    [
      "reorderTasksFn",
      reorderTasksFn,
      { caseId: CASE_ID, status: "nonsense", orderedIds: [TASK_ID] },
    ],
    ["deleteTaskFn", deleteTaskFn, { caseId: CASE_ID }],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("tasks.list")).toEqual([]);
      expect(orpc.calls("tasks.board")).toEqual([]);
      expect(orpc.calls("tasks.get")).toEqual([]);
      expect(orpc.calls("tasks.create")).toEqual([]);
      expect(orpc.calls("tasks.reorder")).toEqual([]);
      expect(orpc.calls("tasks.remove")).toEqual([]);
    }
  );

  it("trims a padded Case id before the API sees it", async () => {
    orpc.reply("tasks.board", { items: [], isTruncated: false });

    await callServerFn(getTaskBoardFn, { caseId: `  ${CASE_ID}  ` });

    expect(orpc.calls("tasks.board")).toEqual([{ caseId: CASE_ID }]);
  });
});
