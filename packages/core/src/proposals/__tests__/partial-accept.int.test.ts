import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { acceptProposalEffect } from "@watchdog/core/proposals";
import {
  entitiesRepo,
  findingSuppressionsRepo,
  identifiersRepo,
  proposalsRepo,
} from "@watchdog/db";
import {
  fingerprintPatchOp,
  type PatchOp,
} from "@watchdog/domain/schemas/graph";
import {
  buildEntityCreateOp,
  buildIdentifierCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/domain/schemas/testing";
import { TEST_ACTOR_ID, testId } from "@watchdog/domain/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedProposal,
  testDb as db,
} from "@watchdog/test-db";

function fingerprints(ops: readonly PatchOp[]): string[] {
  return ops.flatMap((op) => {
    const fp = fingerprintPatchOp(op);
    return fp === null ? [] : [fp];
  });
}

describe("partial Accept", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function seedThree() {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const ops: [PatchOp, PatchOp, PatchOp] = [
      buildIdentifierCreateOp(entity.id, "domain", "a.example", {
        id: testId(31),
      }),
      buildIdentifierCreateOp(entity.id, "domain", "b.example", {
        id: testId(32),
      }),
      buildIdentifierCreateOp(entity.id, "domain", "c.example", {
        id: testId(33),
      }),
    ];
    const { id: proposalId } = await seedProposal(db, cased.id, ops);
    const accept = (opts: {
      opIds?: string[];
      untickedAs?: "left" | "rejected";
    }) =>
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
          ...opts,
        })
      );
    return { cased, entity, ops, proposalId, accept };
  }

  it("applies only the chosen ops and leaves the rest unsuppressed", async () => {
    const { cased, entity, ops, accept } = await seedThree();

    const accepted = await accept({ opIds: [testId(31)] });

    expect(accepted.status).toBe("accepted");
    expect(accepted.leftOpIds).toEqual([testId(32), testId(33)]);
    expect(accepted.rejectedOpIds).toEqual([]);
    const values = (await identifiersRepo.listForEntity(db, entity.id)).map(
      (row) => row.value
    );
    expect(values).toEqual(["a.example"]);
    expect(
      await findingSuppressionsRepo.listFingerprints(
        db,
        cased.id,
        fingerprints(ops.slice(1))
      )
    ).toEqual([]);
  });

  it("fingerprints the unticked ops when they are rejected", async () => {
    const { cased, ops, accept } = await seedThree();

    const accepted = await accept({
      opIds: [testId(31), testId(32)],
      untickedAs: "rejected",
    });

    expect(accepted.leftOpIds).toEqual([]);
    expect(accepted.rejectedOpIds).toEqual([testId(33)]);
    const stored = await findingSuppressionsRepo.listFingerprints(
      db,
      cased.id,
      fingerprints(ops)
    );
    expect(stored).toEqual(fingerprints([ops[2]]));
  });

  it("applies the whole patch when no ops are named", async () => {
    const { entity, accept } = await seedThree();

    const accepted = await accept({});

    expect(accepted.leftOpIds).toEqual([]);
    expect(await identifiersRepo.listForEntity(db, entity.id)).toHaveLength(3);
  });

  it("refuses an empty choice, an op of another patch, and leaves the Proposal pending", async () => {
    const { cased, proposalId, accept } = await seedThree();

    await expect(accept({ opIds: [] })).rejects.toThrow(/at least one/);
    await expect(accept({ opIds: [testId(99)] })).rejects.toThrow(
      /not in this Proposal/
    );
    const row = await proposalsRepo.getInCase(db, cased.id, proposalId);
    expect(row?.proposal.status).toBe("pending");
  });

  it("refuses an op without the Entity it is on, and applies both together", async () => {
    const cased = await seedCase(db);
    const entityOp = buildEntityCreateOp("Acme", "acme", "org", {
      id: testId(40),
    });
    const identifierOp = buildIdentifierCreateOp(
      testId(40),
      "domain",
      "acme.example",
      { id: testId(41) }
    );
    const { id: proposalId } = await seedProposal(db, cased.id, [
      entityOp,
      identifierOp,
    ]);
    const accept = (opIds: string[]) =>
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
          opIds,
        })
      );

    await expect(accept([testId(41)])).rejects.toThrow(/depends on/);
    expect(await entitiesRepo.getById(db, testId(40))).toBeFalsy();

    const accepted = await accept([testId(40), testId(41)]);
    expect(accepted.leftOpIds).toEqual([]);
    expect(await identifiersRepo.listForEntity(db, testId(40))).toHaveLength(1);
  });

  it("refuses an id two ops share when one of them needs an Entity that is not chosen", async () => {
    const cased = await seedCase(db);
    const existing = await seedEntity(db, cased.id, { id: testId(20) });
    const { id: proposalId } = await seedProposal(db, cased.id, [
      buildEntityCreateOp("Acme", "acme", "org", { id: testId(40) }),
      buildIdentifierCreateOp(testId(40), "domain", "acme.example", {
        id: testId(41),
      }),
      buildIdentifierCreateOp(existing.id, "domain", "other.example", {
        id: testId(41),
      }),
    ]);

    await expect(
      runDomain(
        acceptProposalEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          proposalId,
          actorId: TEST_ACTOR_ID,
          confidence: "unverified",
          opIds: [testId(41)],
        })
      )
    ).rejects.toThrow(/depends on/);

    const row = await proposalsRepo.getInCase(db, cased.id, proposalId);
    expect(row?.proposal.status).toBe("pending");
    expect(await entitiesRepo.getById(db, testId(40))).toBeFalsy();
    expect(await identifiersRepo.listForEntity(db, existing.id)).toEqual([]);
  });
});
