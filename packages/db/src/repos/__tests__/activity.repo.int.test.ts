import { describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import { seedCase, seedEvidence, withTestTx } from "@watchdog/test-kit/db";

import { activityRepo } from "../activity.repo.ts";

describe("activityRepo", () => {
  it("lists recent evidence activity for a case", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const evidence = await seedEvidence(tx, cased.id, {
        label: "note",
      });
      const recent = await activityRepo.recentEvidence(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 10,
      });
      expect(recent.some((row) => row.id === evidence.id)).toBe(true);
    });
  });
});
