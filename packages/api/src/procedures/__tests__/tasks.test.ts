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

import { list } from "../tasks";

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
});
