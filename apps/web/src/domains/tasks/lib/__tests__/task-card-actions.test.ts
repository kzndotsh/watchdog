import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import type { TaskRecord } from "../../types.ts";
import { taskCardActions } from "../task-card-actions.ts";

const TASK: TaskRecord = {
  id: testId(20),
  caseId: testId(10),
  entityId: null,
  title: "Follow up",
  description: null,
  status: "backlog",
  priority: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("taskCardActions", () => {
  it("builds Open and Delete actions", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const actions = taskCardActions(TASK, { onOpen, onDelete });

    expect(actions.map((a) => a.id)).toEqual(["task-open", "task-delete"]);
    expect(actions[1]?.destructive).toBe(true);

    actions[0]?.run();
    actions[1]?.run();
    expect(onOpen).toHaveBeenCalledWith(TASK);
    expect(onDelete).toHaveBeenCalledWith(TASK);
  });
});
