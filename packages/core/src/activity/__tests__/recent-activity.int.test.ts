import { beforeEach, describe, expect, it } from "vitest";

import {
  createTaskEffect,
  listRecentActivityEffect,
  updateTaskEffect,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
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
        title: "Follow up WHOIS",
      })
    );
    await runDomain(
      updateTaskEffect({
        caseId: cased.id,
        taskId: task.id,
        status: "in_progress",
      })
    );
    const items = await runDomain(
      listRecentActivityEffect({ caseId: cased.id, limit: 20 })
    );
    expect(items.some((row) => row.kind === "task")).toBe(true);
  });
});
