import { describe, expect, it } from "vitest";

import { TEST_ACTOR_ID } from "@watchdog/test-kit";
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

  it("trims padded playbookId and actorLabel on create", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const created = await playbookRunsRepo.create(tx, {
        caseId: cased.id,
        playbookId: "  host-footprint  ",
        seed: { host: "example.com" },
        status: "running",
        actorId: TEST_ACTOR_ID,
        actorLabel: "  Ada  ",
      });
      expect(created?.playbookId).toBe("host-footprint");
      expect(created?.actorLabel).toBe("Ada");
    });
  });
});
