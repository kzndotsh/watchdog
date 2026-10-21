import { describe, expect, it } from "vitest";

import { seedCase, seedPlaybookRun, withTestTx } from "@watchdog/test-db";

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

  it("finish sets the outcome on a running run and leaves any other status alone", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id);
      const finished = await playbookRunsRepo.finish(
        tx,
        run.id,
        "partial",
        new Date()
      );
      expect(finished).toMatchObject({
        status: "finished",
        outcome: "partial",
      });
      expect(finished?.finishedAt).not.toBeNull();

      const again = await playbookRunsRepo.finish(
        tx,
        run.id,
        "succeeded",
        new Date()
      );
      expect(again).toBeNull();

      const cancelled = await seedPlaybookRun(tx, cased.id, {
        status: "cancelled",
      });
      expect(
        await playbookRunsRepo.finish(tx, cancelled.id, "failed", new Date())
      ).toBeNull();
    });
  });

  it("reopen puts a finished run back to running with no outcome or finish time", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id);
      await playbookRunsRepo.finish(tx, run.id, "failed", new Date());
      const reopened = await playbookRunsRepo.reopen(tx, run.id);
      expect(reopened).toMatchObject({
        status: "running",
        outcome: null,
        finishedAt: null,
      });
      expect(await playbookRunsRepo.reopen(tx, run.id)).toBeNull();
    });
  });
});
