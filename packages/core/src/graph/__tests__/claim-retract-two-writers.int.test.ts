import { beforeEach, describe, expect, it } from "vitest";

import { retractClaimEffect, updateClaimEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { claimsRepo, db } from "@watchdog/db";
import {
  listAllActivity,
  resetTestDb,
  twoWriters,
  type TwoWritersOutcome,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { seedGraphFixture, type GraphFixture } from "./graph-mutations";

function retract(fx: GraphFixture, reason: string) {
  return runDomain(
    retractClaimEffect(
      {
        caseId: fx.caseId,
        organizationId: fx.organizationId,
        claimId: fx.claimId,
        kind: "retracted",
        reason,
      },
      TEST_ACTOR_ID
    )
  );
}

function edit(fx: GraphFixture, text: string) {
  return runDomain(
    updateClaimEffect({
      caseId: fx.caseId,
      organizationId: fx.organizationId,
      claimId: fx.claimId,
      expectedVersion: 1,
      text,
      actorId: TEST_ACTOR_ID,
    })
  );
}

async function claimEntries(fx: GraphFixture) {
  return (await listAllActivity())
    .filter((row) => row.subjectId === fx.claimId)
    .map((row) => row.action);
}

function failure<T>(result: PromiseSettledResult<T>): unknown {
  if (result.status !== "rejected") {
    throw new Error("expected the writer to fail");
  }
  return result.reason;
}

function expectOneWinner(outcome: TwoWritersOutcome<unknown, unknown>) {
  expect(
    [outcome.a, outcome.b].filter((r) => r.status === "fulfilled")
  ).toHaveLength(1);
}

describe("retractClaimEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("two writers", () => {
    it("a second retract that waits on the first is a Conflict and appends nothing", async () => {
      const fx = await seedGraphFixture();
      const race = twoWriters({ pauseAt: "retracted" });
      race.pauseAfter(claimsRepo, "retractInCase", "retracted");

      const outcome = await race.run({
        a: () => retract(fx, "first"),
        b: () => retract(fx, "second"),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({ _tag: "ConflictError" });
      expect((await claimEntries(fx)).filter((a) => a === "retracted")).toEqual(
        ["retracted"]
      );
    });

    it("a retract that read the Claim live loses to one that committed meanwhile", async () => {
      const fx = await seedGraphFixture();
      const race = twoWriters({ pauseAt: "read" });
      race.pauseAfter(claimsRepo, "getInCase", "read");

      const outcome = await race.run({
        a: () => retract(fx, "slow"),
        b: () => retract(fx, "fast"),
      });

      expect(outcome.bBlocked).toBe(false);
      expect(outcome.b.status).toBe("fulfilled");
      expect(failure(outcome.a)).toMatchObject({ _tag: "ConflictError" });
      const row = await claimsRepo.getInCase(db, fx.caseId, fx.claimId);
      expect(row?.retractedReason).toBe("fast");
      expect((await claimEntries(fx)).filter((a) => a === "retracted")).toEqual(
        ["retracted"]
      );
    });

    it("an edit that waits on a retract is stale and leaves the text alone", async () => {
      const fx = await seedGraphFixture();
      const race = twoWriters({ pauseAt: "retracted" });
      race.pauseAfter(claimsRepo, "retractInCase", "retracted");

      const outcome = await race.run({
        a: () => retract(fx, "wrong"),
        b: () => edit(fx, "Edited after"),
      });

      expect(outcome.bBlocked).toBe(true);
      expectOneWinner(outcome);
      expect(failure(outcome.b)).toMatchObject({ _tag: "StaleVersionError" });
      const row = await claimsRepo.getInCase(db, fx.caseId, fx.claimId);
      expect(row?.text).toBe("Wrote the first program");
    });

    it("a retract that waits on an edit still retracts, and both entries are logged", async () => {
      const fx = await seedGraphFixture();
      const race = twoWriters({ pauseAt: "edited" });
      race.pauseAfter(claimsRepo, "updateInCase", "edited");

      const outcome = await race.run({
        a: () => edit(fx, "Edited first"),
        b: () => retract(fx, "wrong"),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(outcome.b.status).toBe("fulfilled");
      const row = await claimsRepo.getInCase(db, fx.caseId, fx.claimId);
      expect(row).toMatchObject({ retracted: true, text: "Edited first" });
      expect((await claimEntries(fx)).filter((a) => a !== "created")).toEqual([
        "updated",
        "retracted",
      ]);
    });
  });
});
