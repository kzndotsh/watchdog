import { describe, expect, it } from "vitest";

import { seedCase, seedPlaybookRun, withTestTx } from "@watchdog/test-kit/db";

import { playbookRunsRepo } from "../playbook-runs.repo.ts";

describe("playbookRunsRepo", () => {
  it("setStatus only updates from running when onlyStatuses is set", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id, { status: "finished" });
      const updated = await playbookRunsRepo.setStatus(
        tx,
        run.id,
        "cancelled",
        new Date(),
        { onlyStatuses: ["running"] }
      );
      expect(updated).toBeNull();
    });
  });
});
