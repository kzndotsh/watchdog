import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import {
  acceptProposalEffect,
  createAgentProposalEffect,
  listProposalsForCaseEffect,
  rejectProposalEffect,
} from "@watchdog/core/proposals";
import { activity, activityLogRepo, db } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  buildClaimCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedJob,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { suppressAndProposeStageEffect } from "../../jobs/stages/propose";

const START = { xid: "0", id: 0 } as const;

async function log() {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter(
    (row) => row.kind === "proposal" || row.kind === "evidence"
  );
}

function pendingCount(caseId: CaseId) {
  return runDomain(
    listProposalsForCaseEffect(caseId, TEST_ORGANIZATION_ID, {
      status: "pending",
    })
  ).then((rows) => rows.length);
}

/** The seeds append their own entries; these tests count only what the code under test appends. */
async function forgetSeedActivity() {
  await db.delete(activity);
}

describe("Proposal write paths append to the activity log", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("logs created for an agent Proposal with the agent as actor", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });

    const { proposal } = await runDomain(
      createAgentProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        patch: [
          buildClaimCreateOp(entity.id, "Agent saw a host", { id: testId(30) }),
        ],
      })
    );

    const rows = await log();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "proposal",
      action: "created",
      subjectId: proposal.id,
      caseId: cased.id,
      actorId: TEST_ACTOR_ID,
      label: null,
    });
    expect(await pendingCount(cased.id)).toBe(1);
  });

  it("logs created for a Job-created Proposal, and none when everything is suppressed", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const job = await seedJob(db, cased.id, { status: "running" });

    const proposed = await runDomain(
      suppressAndProposeStageEffect({
        caseId: cased.id,
        patch: [
          buildClaimCreateOp(entity.id, "From a Cap", { id: testId(31) }),
        ],
        resultSummary: "found",
        attachEvidenceIds: [],
        jobId: job.id,
        // run-job passes the Job's user; the log entry still has no actor
        createdBy: job.actorId,
      })
    );
    const empty = await runDomain(
      suppressAndProposeStageEffect({
        caseId: cased.id,
        patch: [],
        resultSummary: null,
        attachEvidenceIds: [],
        jobId: job.id,
      })
    );

    expect(empty.proposalId).toBeNull();
    const rows = await log();
    expect(rows.map((row) => [row.action, row.subjectId, row.actorId])).toEqual(
      [["created", proposed.proposalId, null]]
    );
  });

  it("logs exactly one accepted entry in the Accept transaction, with its attestation", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Attested", { id: testId(32) }),
    ]);
    await forgetSeedActivity();
    const pendingBefore = await pendingCount(cased.id);

    await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
        attestationText: "I saw this in WHOIS",
      })
    );

    const rows = await log();
    expect(rows.map((row) => `${row.kind}.${row.action}`).sort()).toEqual([
      "evidence.captured",
      "proposal.accepted",
    ]);
    const accepted = rows.find((row) => row.kind === "proposal");
    expect(accepted).toMatchObject({
      subjectId: proposalId,
      actorId: TEST_ACTOR_ID,
      toValue: "accepted",
    });
    // Same transaction: one xid for the decision and the attestation it created.
    expect(new Set(rows.map((row) => row.xid)).size).toBe(1);
    expect(pendingBefore).toBe(1);
    expect(await pendingCount(cased.id)).toBe(0);
  });

  it("logs nothing when Accept is refused", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(23) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Needs evidence", { id: testId(33) }),
    ]);
    await forgetSeedActivity();

    await expect(
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
          // Missing Evidence is refused after the attestation was written.
          sharedEvidenceIds: [testId(99)],
          attestationText: "rolled back with the refusal",
        })
      )
    ).rejects.toMatchObject({ _tag: "InvalidError" });

    expect(await log()).toEqual([]);
    expect(await pendingCount(cased.id)).toBe(1);
  });

  it("logs exactly one rejected entry, and none for a second reject", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(24) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Wrong", { id: testId(34) }),
    ]);
    await forgetSeedActivity();
    const input = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      proposalId,
      actorId: TEST_ACTOR_ID,
    } as const;

    await runDomain(rejectProposalEffect({ ...input, reason: "not relevant" }));
    await expect(runDomain(rejectProposalEffect(input))).rejects.toMatchObject({
      _tag: "ConflictError",
    });

    const rows = await log();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "proposal",
      action: "rejected",
      subjectId: proposalId,
      actorId: TEST_ACTOR_ID,
      toValue: "rejected",
    });
    expect(await pendingCount(cased.id)).toBe(0);
  });

  it("logs one accepted entry when two Accepts race", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(25) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildClaimCreateOp(entity.id, "Race", { id: testId(35) }),
    ]);
    await forgetSeedActivity();
    const accept = () =>
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
        })
      );

    const settled = await Promise.allSettled([accept(), accept()]);

    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await log()).map((row) => row.action)).toEqual(["accepted"]);
  });
});
