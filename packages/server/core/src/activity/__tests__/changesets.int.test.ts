import { beforeEach, describe, expect, it } from "vitest";

import { createEntityEffect } from "#core/graph";
import { runDomain } from "#core/infra";
import {
  acceptProposalEffect,
  writeGraphFromAgentEffect,
} from "#core/proposals";
import { proposalsRepo } from "#db";
import {
  listAllGraphHistory,
  listCaseChangesets,
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedProposal,
  testDb as db,
} from "#test-db";
import type { CaseId } from "@watchdog/domain/schemas/shared";
import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/domain/schemas/testing";
import { TEST_ACTOR_ID, testId } from "@watchdog/domain/test-kit";

/**
 * #724: each Graph write transaction records one changeset, and every `graph_history` row it
 * writes names that changeset. `run` returns what the write left behind: the changesets and the
 * history rows that are new since it started.
 */
async function run<A>(caseId: CaseId, write: () => Promise<A>) {
  const changesetsBefore = (await listCaseChangesets(db, caseId)).length;
  const historyBefore = (await listAllGraphHistory()).length;
  const result = await write();
  return {
    result,
    changesets: (await listCaseChangesets(db, caseId)).slice(changesetsBefore),
    history: (await listAllGraphHistory()).slice(historyBefore),
  };
}

describe("one changeset per Graph write transaction", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("a Dossier edit records one dossier changeset with the caller, and its history names it", async () => {
    const cased = await seedCase(db);
    const { changesets, history } = await run(cased.id, () =>
      runDomain(
        createEntityEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          kind: "person",
          name: "Ada Lovelace",
          slug: "ada",
          actorId: TEST_ACTOR_ID,
          actorKeyId: "key-1",
        })
      )
    );

    expect(changesets).toHaveLength(1);
    expect(changesets[0]).toMatchObject({
      channel: "dossier",
      actorId: TEST_ACTOR_ID,
      actorKeyId: "key-1",
      proposalId: null,
      patch: null,
    });
    // The Entity and its seeded default Questions: one transaction, one changeset.
    expect(history.length).toBeGreaterThan(1);
    expect(history.every((row) => row.changesetId === changesets[0]?.id)).toBe(
      true
    );
  });

  it("a write with no caller records one system changeset", async () => {
    const cased = await seedCase(db);
    const { changesets, history } = await run(cased.id, () =>
      runDomain(
        createEntityEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          kind: "org",
          name: "Acme",
          slug: "acme",
        })
      )
    );

    expect(changesets).toHaveLength(1);
    expect(changesets[0]).toMatchObject({ channel: "system", actorId: null });
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((row) => row.changesetId === changesets[0]?.id)).toBe(
      true
    );
  });

  it("an agent write records one agent_write changeset with its patch, and a replay records none", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const patch = [
      buildClaimCreateOp(entity.id, "Agent saw a host", { id: testId(30) }),
    ];
    const input = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      actorId: TEST_ACTOR_ID,
      actorLabel: "api-key:agent",
      actorKeyId: "key-agent",
      userOverride: true as const,
      patch,
      summary: "agent cite",
      idempotencyKey: "key-1",
    };

    const first = await run(cased.id, () =>
      runDomain(writeGraphFromAgentEffect(input))
    );
    expect(first.changesets).toHaveLength(1);
    expect(first.changesets[0]).toMatchObject({
      id: first.result.writeId,
      channel: "agent_write",
      actorId: TEST_ACTOR_ID,
      actorLabel: "api-key:agent",
      actorKeyId: "key-agent",
      confidence: "unverified",
      summary: "agent cite",
      idempotencyKey: "key-1",
      patch,
    });
    // The Claim's create, then its Evidence link (the summary's attestation): one changeset.
    expect(first.history.map((row) => [row.kind, row.op])).toEqual([
      ["claim", "create"],
      ["claim", "update"],
    ]);
    expect(
      first.history.every((row) => row.changesetId === first.result.writeId)
    ).toBe(true);

    const replay = await run(cased.id, () =>
      runDomain(writeGraphFromAgentEffect(input))
    );
    expect(replay.result).toMatchObject({
      writeId: first.result.writeId,
      replayed: true,
    });
    expect(replay.changesets).toEqual([]);
    expect(replay.history).toEqual([]);
  });

  it("traces a confirmed Claim to the Triage Accept that wrote it and its Proposal", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const evidence = await seedEvidence(db, cased.id);
    const claimId = testId(31);
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildEntityCreateOp("Grace Hopper", "grace", "person", {
        id: testId(40),
      }),
      buildClaimCreateOp(entity.id, "Coined debugging", { id: claimId }),
    ]);

    const { changesets, history } = await run(cased.id, () =>
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "confirmed",
          sharedEvidenceIds: [evidence.id],
        })
      )
    );
    expect(changesets).toHaveLength(1);
    expect(history.every((row) => row.changesetId === changesets[0]?.id)).toBe(
      true
    );

    // From the Claim alone: its creating history row, that row's changeset, the Proposal.
    const created = history.find(
      (row) =>
        row.kind === "claim" && row.rowId === claimId && row.op === "create"
    );
    expect(created?.after).toMatchObject({ confidence: "confirmed" });
    const accept = (await listCaseChangesets(db, cased.id)).find(
      (row) => row.id === created?.changesetId
    );
    expect(accept).toMatchObject({
      channel: "triage_accept",
      actorId: TEST_ACTOR_ID,
      proposalId,
    });
    const proposal = await proposalsRepo.getInCase(db, cased.id, proposalId);
    expect(proposal?.proposal).toMatchObject({
      status: "accepted",
      decidedBy: TEST_ACTOR_ID,
    });
  });
});
