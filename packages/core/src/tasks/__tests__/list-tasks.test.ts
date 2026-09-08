import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import { listTasksForCaseEffect } from "../tasks";

vi.mock("@watchdog/db", () => ({
  db: {},
  tasksRepo: { listForCase: vi.fn() },
}));

vi.mock("../../graph/patch/guards", () => ({
  assertCaseInOrgEffect: (caseId: string) => Effect.succeed(caseId),
}));

describe("listTasksForCaseEffect", () => {
  it("rejects invalid entityId filters", async () => {
    await expect(
      Effect.runPromise(
        listTasksForCaseEffect(testId(1), testId(2), {
          entityId: "not-a-uuid",
        })
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "entityId must be a valid UUID",
    });
  });
});
