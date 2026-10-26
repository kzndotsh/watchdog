import { describe, expect, it } from "vitest";

import type { TaskRecord } from "@/domains/tasks/types";
import { testCaseId } from "@watchdog/schemas/testing";

import { selectDueTasks } from "../selectors.ts";

describe("dashboard selectors", () => {
  it("selects the due tasks", () => {
    const overdue: TaskRecord = {
      id: "t1",
      caseId: testCaseId(1),
      entityId: null,
      title: "Late",
      description: null,
      status: "backlog",
      priority: null,
      dueDate: "2000-01-01T12:00:00.000Z",
      position: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(selectDueTasks([overdue]).map((row) => row.id)).toEqual(["t1"]);
  });
});
