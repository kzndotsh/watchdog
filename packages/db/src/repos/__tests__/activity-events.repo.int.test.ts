import { describe, expect, it } from "vitest";

import { testId, TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import { seedCase, withTestTx } from "@watchdog/test-kit/db";

import { activityEventsRepo } from "../activity-events.repo.ts";

describe("activityEventsRepo", () => {
  it("returns recent events for a case", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await activityEventsRepo.create(tx, {
        caseId: cased.id,
        kind: "task",
        action: "status_changed",
        subjectId: testId(20),
        label: "Follow up",
        fromValue: "backlog",
        toValue: "in_progress",
      });
      const recent = await activityEventsRepo.recent(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        kind: "task",
        limit: 10,
      });
      expect(recent.some((row) => row.action === "status_changed")).toBe(true);
    });
  });
});
