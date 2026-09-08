import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listTasksForCaseEffect } = vi.hoisted(() => ({
  listTasksForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listTasksForCaseEffect,
    getTaskInCaseEffect: vi.fn(),
    createTaskEffect: vi.fn(),
    updateTaskEffect: vi.fn(),
    deleteTaskEffect: vi.fn(),
    reorderTasksEffect: vi.fn(),
  };
});

import { list, reorder, update } from "../tasks";

const caseId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000060";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("tasks procedures", () => {
  it("lists tasks for a case", async () => {
    listTasksForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000060",
          caseId: "00000000-0000-4000-8000-000000000001",
          entityId: null,
          title: "Follow up DNS",
          description: null,
          status: "backlog",
          priority: "medium",
          dueDate: null,
          position: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
    );

    const client = createRouterClient(
      { list },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.list({ caseId: "00000000-0000-4000-8000-000000000001" })
    ).resolves.toHaveLength(1);
  });

  it("rejects an empty task update body", async () => {
    const client = createRouterClient(
      { update },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.update({ caseId, taskId })).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });

  it("rejects task reorder with empty orderedIds", async () => {
    const client = createRouterClient(
      { reorder },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.reorder({ caseId, status: "backlog", orderedIds: [] })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });
});
