import { describe, expect, it } from "vitest";

import { dueDateToIso, isoToDateInput, isTaskDueOverdue } from "../due-date.ts";
import {
  EMPTY_TASK_FORM,
  normalizeTaskForm,
  taskFormIssues,
} from "../task-form.ts";

describe("task due-date", () => {
  it("round-trips a calendar day", () => {
    const iso = dueDateToIso("2026-01-15");
    expect(iso).toBeTruthy();
    expect(isoToDateInput(iso)).toBe("2026-01-15");
    expect(isTaskDueOverdue("2000-01-01T12:00:00.000Z", "backlog")).toBe(true);
    expect(isTaskDueOverdue("2000-01-01T12:00:00.000Z", "done")).toBe(false);
  });
});

describe("task-form", () => {
  it("requires a title", () => {
    expect(taskFormIssues(EMPTY_TASK_FORM)).toContain("Title is required");
    expect(
      taskFormIssues({ ...EMPTY_TASK_FORM, title: "Follow up WHOIS" })
    ).toEqual([]);
  });

  it("normalizes trimmed title and collapses blank description", () => {
    expect(
      normalizeTaskForm({
        ...EMPTY_TASK_FORM,
        title: "  Follow up  ",
        description: "   ",
      })
    ).toEqual({
      ...EMPTY_TASK_FORM,
      title: "Follow up",
      description: "",
    });
  });
});
