import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { TEST_ORGANIZATION_ID, testCaseId } from "@watchdog/test-kit";

import { runDomain } from "../../infra/run-domain";
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
      runDomain(
        listTasksForCaseEffect(testCaseId(1), TEST_ORGANIZATION_ID, {
          entityId: "not-a-uuid",
        })
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "entityId must be a valid UUID",
    });
  });
});
