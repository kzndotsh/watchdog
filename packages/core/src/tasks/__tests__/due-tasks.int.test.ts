import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { getTaskBoardEffect, listDueTasksEffect } from "@watchdog/core/tasks";
import { db, tasks } from "@watchdog/db";
import { TASK_BOARD_MAX, TASK_DUE_LIST_LIMIT } from "@watchdog/schemas/feed";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  withSystemHistoryContext,
} from "@watchdog/test-db";

const DAY_START = new Date("2026-03-10T00:00:00.000Z");
const day = (offset: number) =>
  new Date(DAY_START.getTime() + offset * 24 * 60 * 60 * 1000);

describe("listDueTasksEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("finds a due Task the board's cap leaves out", async () => {
    const cased = await seedCase(db);
    // More open Tasks than the board holds; the only due one sorts last by position.
    const open = Array.from({ length: TASK_BOARD_MAX + 1 }, (_, n) => ({
      caseId: cased.id,
      title: `Open ${String(n)}`,
      status: "backlog" as const,
      position: n,
      dueDate: n === TASK_BOARD_MAX ? day(2) : null,
    }));
    await withSystemHistoryContext(db, async (tx) => {
      await tx.insert(tasks).values(open);
    });

    const board = await runDomain(
      getTaskBoardEffect(cased.id, TEST_ORGANIZATION_ID, {})
    );
    expect(board.isTruncated).toBe(true);
    expect(board.items.some((task) => task.title === "Open 500")).toBe(false);

    const due = await runDomain(
      listDueTasksEffect(cased.id, TEST_ORGANIZATION_ID, {
        dayStart: DAY_START,
      })
    );
    expect(due.items.map((task) => task.title)).toEqual(["Open 500"]);
    expect(due.total).toEqual({ count: 1, isCapped: false });
  });

  it("lists open Tasks overdue or due in the window, soonest first, with the total past the limit", async () => {
    const cased = await seedCase(db);
    const dueRows = Array.from({ length: TASK_DUE_LIST_LIMIT + 2 }, (_, n) => ({
      caseId: cased.id,
      title: `Due ${String(n).padStart(2, "0")}`,
      status: "in_progress" as const,
      // From three days overdue to six days ahead.
      dueDate: day(n - 3),
    }));
    await withSystemHistoryContext(db, async (tx) => {
      await tx.insert(tasks).values([
        ...dueRows,
        // Finished, undated, or past the window: never listed.
        { caseId: cased.id, title: "Done", status: "done", dueDate: day(-1) },
        {
          caseId: cased.id,
          title: "Dropped",
          status: "dropped",
          dueDate: day(0),
        },
        { caseId: cased.id, title: "Undated", status: "backlog" },
        {
          caseId: cased.id,
          title: "Later",
          status: "blocked",
          dueDate: day(30),
        },
      ]);
    });

    const due = await runDomain(
      listDueTasksEffect(cased.id, TEST_ORGANIZATION_ID, {
        dayStart: DAY_START,
      })
    );
    expect(due.items.map((task) => task.title)).toEqual(
      dueRows.slice(0, TASK_DUE_LIST_LIMIT).map((row) => row.title)
    );
    expect(due.total).toEqual({
      count: TASK_DUE_LIST_LIMIT + 2,
      isCapped: false,
    });
  });
});
