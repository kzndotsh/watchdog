import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  getJobForCaseEffect,
  listJobsForCaseEffect,
  recordingJobQueue,
  startJobEffect,
} from "@watchdog/core/jobs";
import {
  acceptProposalEffect,
  listProposalsForCaseEffect,
} from "@watchdog/core/proposals";
import { vaultLayer } from "@watchdog/core/vault";
import { db, jobsRepo } from "@watchdog/db";
import {
  buildClaimCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  expectQueries,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

/**
 * Measured on main before the link tables (#302). Accept is 13 with the Graph history (#303): the
 * one `set_config` statement that tells the triggers who is accepting; the history rows themselves
 * are written by those triggers inside Postgres. Job start writes no Graph row and stays at 4.
 */
const ACCEPT_STATEMENTS = 13;
const START_STATEMENTS = 4;

const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(Layer.provideMerge(vaultLayer, Db.layer), queue.layer)
);

/**
 * Statement budgets for the two hot paths the custody invariants touch (#302): Accept and Job
 * start. Evidence ids moved from JSON columns to link tables; reading them must not add a
 * round trip (the repos fold them into the row's own statement), so these counts are the ones
 * measured before the change.
 */
describe("custody hot paths: statement counts", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("accepts a Proposal that cites Evidence in a fixed number of statements", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const evidence = await seedEvidence(db, cased.id);
    const { id: proposalId } = await seedProposal(
      db,
      cased.id,
      [
        buildClaimCreateOp(entity.id, "Ada observed a host", {
          id: testId(30),
        }),
      ],
      { evidenceIds: [evidence.id] }
    );
    const accepted = await expectQueries({ max: ACCEPT_STATEMENTS }, () =>
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
        })
      )
    );
    expect(accepted.evidenceIds).toEqual([evidence.id]);
  });

  it("starts a Job in a fixed number of statements", async () => {
    const cased = await seedCase(db);
    const started = await expectQueries({ max: START_STATEMENTS }, () =>
      runDomain(
        startJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: "network.dns.lookup",
          actorId: TEST_ACTOR_ID,
          input: { host: "mailhost.test" },
        })
      )
    );
    expect(started.status).toBe("queued");
  });

  it("reads Jobs and Proposals with their Evidence ids in one statement per read", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id);
    const job = await seedJob(db, cased.id, { evidenceIds: [evidence.id] });
    await seedProposal(db, cased.id, [], { evidenceIds: [evidence.id] });
    const list = await expectQueries({ max: 2 }, () =>
      runDomain(
        listJobsForCaseEffect(cased.id, TEST_ORGANIZATION_ID).pipe(
          Effect.map((page) => page.items)
        )
      )
    );
    const one = await expectQueries({ max: 2 }, () =>
      runDomain(getJobForCaseEffect(cased.id, TEST_ORGANIZATION_ID, job.id))
    );
    const proposals = await expectQueries({ max: 2 }, () =>
      runDomain(
        listProposalsForCaseEffect(cased.id, TEST_ORGANIZATION_ID).pipe(
          Effect.map((page) => page.items)
        )
      )
    );
    // The preflight load of a Job (reclaim reads its stored Evidence ids from it).
    const reloaded = await expectQueries(1, () => jobsRepo.get(db, job.id));
    expect(list[0]?.evidenceIds).toEqual([evidence.id]);
    expect(one.evidenceIds).toEqual([evidence.id]);
    expect(proposals[0]?.evidenceIds).toEqual([evidence.id]);
    expect(reloaded?.evidenceIds).toEqual([evidence.id]);
  });
});
