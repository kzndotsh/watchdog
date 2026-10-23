import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import {
  acceptProposalEffect,
  rejectProposalEffect,
} from "@watchdog/core/proposals";
import { activity, claimsRepo, db, proposalsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  buildClaimCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetTestDb,
  seedCase,
  seedEntity,
  seedProposal,
  twoWriters,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const CLAIM_ID = testId(35);

async function seedPending() {
  const cased = await seedCase(db);
  const entity = await seedEntity(db, cased.id, { id: testId(25) });
  const { id: proposalId } = await seedProposal(db, cased.id, [
    buildClaimCreateOp(entity.id, "Contested", { id: CLAIM_ID }),
  ]);
  // The seeds append their own entries; the tests read only what the writers append.
  await db.delete(activity);
  return { caseId: cased.id, proposalId };
}

type Pending = { caseId: CaseId; proposalId: string };

function accept(p: Pending) {
  return runDomain(
    acceptProposalEffect({
      caseId: p.caseId,
      organizationId: TEST_ORGANIZATION_ID,
      proposalId: p.proposalId,
      actorId: TEST_ACTOR_ID,
      confidence: "unverified",
    })
  );
}

function reject(p: Pending) {
  return runDomain(
    rejectProposalEffect({
      caseId: p.caseId,
      organizationId: TEST_ORGANIZATION_ID,
      proposalId: p.proposalId,
      actorId: TEST_ACTOR_ID,
      reason: "not relevant",
    })
  );
}

async function decisions() {
  return (await listAllActivity())
    .filter((row) => row.kind === "proposal")
    .map((row) => row.action);
}

async function claimExists(p: Pending) {
  return (await claimsRepo.getInCase(db, p.caseId, CLAIM_ID)) !== null;
}

function failure(result: PromiseSettledResult<unknown>): unknown {
  if (result.status !== "rejected") throw new Error("expected a failure");
  return result.reason;
}

describe("Proposal decisions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe("two writers", () => {
    it("a reject that waits on an accept is a Conflict, and the Claim lands once", async () => {
      const p = await seedPending();
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(proposalsRepo, "lockInCase", "locked");

      const outcome = await race.run({
        a: () => accept(p),
        b: () => reject(p),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({
        _tag: "ConflictError",
        reason: "Proposal is already accepted",
      });
      expect(await decisions()).toEqual(["accepted"]);
      expect(await claimExists(p)).toBe(true);
    });

    it("an accept that waits on a reject is a Conflict, and no Claim lands", async () => {
      const p = await seedPending();
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(proposalsRepo, "lockInCase", "locked");

      const outcome = await race.run({
        a: () => reject(p),
        b: () => accept(p),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({
        _tag: "ConflictError",
        reason: "Proposal is already rejected",
      });
      expect(await decisions()).toEqual(["rejected"]);
      expect(await claimExists(p)).toBe(false);
    });

    it("two rejects decide once", async () => {
      const p = await seedPending();
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(proposalsRepo, "lockInCase", "locked");

      const outcome = await race.run({
        a: () => reject(p),
        b: () => reject(p),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({ _tag: "ConflictError" });
      expect(await decisions()).toEqual(["rejected"]);
    });

    it("two accepts decide once and the Claim lands once", async () => {
      const p = await seedPending();
      const race = twoWriters({ pauseAt: "locked" });
      race.pauseAfter(proposalsRepo, "lockInCase", "locked");

      const outcome = await race.run({
        a: () => accept(p),
        b: () => accept(p),
      });

      expect(outcome.bBlocked).toBe(true);
      expect(outcome.a.status).toBe("fulfilled");
      expect(failure(outcome.b)).toMatchObject({ _tag: "ConflictError" });
      expect(await decisions()).toEqual(["accepted"]);
    });
  });
});
