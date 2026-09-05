import { beforeEach, describe, expect, it } from "vitest";

import {
  createTaskEffect,
  listRecentActivityEffect,
  updateTaskEffect,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { TEST_ACTOR_ID, TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import { resetTestDb, seedCase } from "@watchdog/test-kit/db";

describe("listRecentActivity", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("merges a task status change from the database", async () => {
    const cased = await seedCase(db);
    const task = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Follow up WHOIS",
        actorId: TEST_ACTOR_ID,
      })
    );
    await runDomain(
      updateTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        taskId: task.id,
        status: "in_progress",
        actorId: TEST_ACTOR_ID,
      })
    );
    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );
    expect(items.some((row) => row.kind === "task")).toBe(true);
    expect(
      items.some((row) => row.kind === "task" && row.actor === TEST_ACTOR_ID)
    ).toBe(true);
  });
});
