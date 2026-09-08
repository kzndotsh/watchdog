import { describe, expect, it } from "vitest";

import {
  buildCreateTaskData,
  buildUpdateTaskData,
} from "@/domains/tasks/lib/task-write";
import { testId } from "@watchdog/test-kit";

describe("buildCreateTaskData", () => {
  it("trims title and clears blank description", () => {
    const caseId = testId(10);
    const entityId = testId(20);
    const parsed = buildCreateTaskData(caseId, {
      title: "  Follow up  ",
      description: "   ",
      status: "backlog",
      priority: "",
      dueDate: "",
      entityId: `  ${entityId}  `,
    });
    expect(parsed.title).toBe("Follow up");
    expect(parsed.description).toBeUndefined();
    expect(parsed.entityId).toBe(entityId);
    expect(parsed.priority).toBeNull();
  });
});

describe("buildUpdateTaskData", () => {
  it("clears description when the form sends an empty string", () => {
    const caseId = testId(10);
    const taskId = testId(11);
    const parsed = buildUpdateTaskData(caseId, taskId, {
      title: "Updated",
      description: "",
      status: "in_progress",
      priority: "high",
      dueDate: "",
      entityId: "",
    });
    expect(parsed.description).toBeNull();
    expect(parsed.entityId).toBeNull();
  });
});
