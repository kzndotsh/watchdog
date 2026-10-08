import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { runDomain } from "@watchdog/core/infra";
import {
  acceptProposalEffect,
  writeGraphFromAgentEffect,
} from "@watchdog/core/proposals";
import {
  activity,
  activityLogRepo,
  claimsRepo,
  db,
  entitiesRepo,
  graphWritesRepo,
  proposalsRepo,
} from "@watchdog/db";
import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

const START = { xid: "0", id: 0 } as const;

async function entries() {
  return activityLogRepo.drain(db, { after: START, limit: 1000 });
}

/** The seeds append their own entries; these tests count only what the code under test appends. */
async function forgetSeedActivity() {
  await db.delete(activity);
}

describe("Accept appends one Graph entry per op in the Accept transaction", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs each op with the reviewer as actor, next to the proposal decision, in one transaction", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildEntityCreateOp("Grace Hopper", "grace", "person", {
        id: testId(40),
      }),
      buildClaimCreateOp(entity.id, "Coined debugging", { id: testId(41) }),
    ]);
    await forgetSeedActivity();

    await runDomain(
      acceptProposalEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        proposalId,
        actorId: TEST_ACTOR_ID,
        confidence: "unverified",
      })
    );

    const rows = await entries();
    expect(rows.map((row) => `${row.kind}.${row.action}`)).toEqual([
      "entity.created",
      "claim.created",
      "proposal.accepted",
    ]);
    expect(rows.every((row) => row.actorId === TEST_ACTOR_ID)).toBe(true);
    expect(rows[0]).toMatchObject({
      subjectId: testId(40),
      label: "Grace Hopper",
    });
    // One transaction: the same xid for the ops and the decision.
    expect(new Set(rows.map((row) => row.xid)).size).toBe(1);
  });

  it("a failed Accept (second op invalid) leaves no Graph entry and keeps the proposal pending", async () => {
    const cased = await seedCase(db);
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildEntityCreateOp("Grace Hopper", "grace", "person", {
        id: testId(40),
      }),
      buildClaimCreateOp(testId(99), "Orphan claim", { id: testId(41) }),
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
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    // the first op's Entity rolled back with the second op's failure
    expect(await entitiesRepo.listForCase(db, cased.id)).toEqual([]);
    expect(await graphWritesRepo.listForCase(db, cased.id)).toEqual([]);
    expect(
      (await proposalsRepo.getInCase(db, cased.id, proposalId))?.proposal.status
    ).toBe("pending");
    expect(await entries()).toEqual([]);
  });
});

describe("the agent graph write appends per op and leaves graph_writes alone", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs each op with the agent as actor and keeps the graph_writes row and the Graph", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });

    const written = await runDomain(
      writeGraphFromAgentEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        actorLabel: "Agent",
        userOverride: true,
        patch: [
          buildClaimCreateOp(entity.id, "Agent saw a host", {
            id: testId(30),
          }),
        ],
        idempotencyKey: "key-1",
      })
    );

    expect(written.replayed).toBe(false);
    const audit = await graphWritesRepo.get(db, written.writeId);
    expect(audit).toMatchObject({
      channel: "agent_write",
      confidence: "unverified",
      idempotencyKey: "key-1",
    });
    expect(
      (await claimsRepo.listForEntity(db, entity.id)).map((row) => row.text)
    ).toContain("Agent saw a host");
    const rows = await entries();
    expect(rows.map((row) => `${row.kind}.${row.action}`)).toEqual([
      "claim.created",
    ]);
    expect(rows[0]).toMatchObject({
      actorId: TEST_ACTOR_ID,
      actorLabel: "Agent",
      subjectId: testId(30),
    });
  });

  it("a replayed idempotency key appends nothing and writes no second graph_writes row", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const input = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_ACTOR_ID,
      actorLabel: "Agent",
      userOverride: true as const,
      patch: [buildClaimCreateOp(entity.id, "Once only", { id: testId(30) })],
      idempotencyKey: "same-key",
    };

    await runDomain(writeGraphFromAgentEffect(input));
    const afterFirst = await entries();
    const second = await runDomain(writeGraphFromAgentEffect(input));

    expect(second.replayed).toBe(true);
    expect(await entries()).toHaveLength(afterFirst.length);
    expect(await graphWritesRepo.listForCase(db, cased.id)).toHaveLength(1);
  });

  it("a failed append rolls back the graph_writes row and the Graph", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const append = vi
      .spyOn(activityLogRepo, "append")
      .mockRejectedValueOnce(new Error("append failed"));

    await expect(
      runDomain(
        writeGraphFromAgentEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
          actorLabel: "Agent",
          userOverride: true,
          patch: [
            buildClaimCreateOp(entity.id, "Never lands", { id: testId(30) }),
          ],
        })
      )
    ).rejects.toThrow("append failed");
    expect(append).toHaveBeenCalledTimes(1);

    expect(await graphWritesRepo.listForCase(db, cased.id)).toEqual([]);
    expect(await claimsRepo.listForEntity(db, entity.id)).toEqual([]);
    expect(await entries()).toEqual([]);
  });
});
