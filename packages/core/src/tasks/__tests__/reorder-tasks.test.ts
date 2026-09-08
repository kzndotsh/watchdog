import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import { reorderTasksEffect } from "../tasks";

vi.mock("@watchdog/db", () => ({
  db: {},
  casesRepo: { lockById: vi.fn() },
  tasksRepo: { listForCase: vi.fn(), rewriteOrder: vi.fn() },
}));

vi.mock("../../graph/patch/guards", () => ({
  assertCaseInOrgEffect: (caseId: string) => Effect.succeed(caseId),
  assertEntityInCaseEffect: vi.fn(),
  requireTrimmedGraphId: vi.fn(),
}));

vi.mock("../../infra/events", () => ({
  notifyTaskChangedEffect: () => Effect.void,
}));

vi.mock("../../infra/postgres-tx", () => ({
  transact: () => Effect.succeed([]),
}));

describe("reorderTasksEffect", () => {
  it("rejects invalid task ids before reordering", async () => {
    await expect(
      Effect.runPromise(
        reorderTasksEffect({
          caseId: testId(1),
          organizationId: testId(2),
          status: "todo",
          orderedIds: [testId(3), "not-a-uuid"],
        })
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "Task order contains an invalid task id",
    });
  });
});
