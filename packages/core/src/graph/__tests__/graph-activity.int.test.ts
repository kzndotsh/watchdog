import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { applyPatchEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { activityLogRepo, db } from "@watchdog/db";
import { resetTestDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import {
  GRAPH_MUTATIONS,
  seedGraphFixture,
  type GraphMutation,
} from "./graph-mutations";

const START = { xid: "0", id: 0 } as const;

async function allEntries() {
  return activityLogRepo.drain(db, { after: START, limit: 1000 });
}

function mutationNamed(name: string): GraphMutation {
  const found = GRAPH_MUTATIONS.find((mutation) => mutation.name === name);
  if (found === undefined) throw new Error(`No registered mutation ${name}`);
  return found;
}

describe("every registered Graph mutation appends exactly once", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it.each(
    GRAPH_MUTATIONS.map((mutation) => [mutation.name, mutation] as const)
  )("%s", async (_name, mutation) => {
    const fx = await seedGraphFixture();
    const before = await allEntries();
    const result = await runDomain(mutation.run(fx));
    const added = (await allEntries()).slice(before.length);
    expect(added).toHaveLength(mutation.entries ?? 1);
    for (const row of added) {
      expect(row.caseId).toBe(fx.caseId);
      expect(row.kind).toBe(mutation.kind);
      expect(row.action).toBe(mutation.action);
      expect(row.subjectId).toBe(mutation.subjectId(fx, result));
      // every mutation runs as the caller: no entry has a null actor
      expect(row.actorId).toBe(TEST_ACTOR_ID);
    }
  });
});

describe("Graph entries carry the subject and a label", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("entity.created points at the Entity, labels it with its name", async () => {
    const fx = await seedGraphFixture();
    const created = (await runDomain(
      mutationNamed("entity.create").run(fx)
    )) as { id: string };
    const row = (await allEntries()).at(-1)!;
    expect(row).toMatchObject({
      kind: "entity",
      action: "created",
      subjectId: created.id,
      label: "Grace Hopper",
    });
  });

  it("a delete keeps the label, since the subject is gone", async () => {
    const fx = await seedGraphFixture();
    await runDomain(mutationNamed("entity.delete").run(fx));
    expect((await allEntries()).at(-1)).toMatchObject({
      kind: "entity",
      action: "deleted",
      subjectId: fx.otherEntityId,
      label: "Charles Babbage",
    });
  });

  it("question.resolved records the transition and claim.retracted the actor", async () => {
    const fx = await seedGraphFixture();
    await runDomain(mutationNamed("question.resolve").run(fx));
    expect((await allEntries()).at(-1)).toMatchObject({
      kind: "question",
      action: "resolved",
      subjectId: fx.questionId,
      fromValue: "open",
      toValue: "resolved",
    });
    await runDomain(mutationNamed("claim.retract").run(fx));
    expect((await allEntries()).at(-1)).toMatchObject({
      kind: "claim",
      action: "retracted",
      subjectId: fx.claimId,
      actorId: TEST_ACTOR_ID,
    });
  });

  it("a Case update keeps the Case as the subject", async () => {
    const fx = await seedGraphFixture();
    await runDomain(mutationNamed("case.update").run(fx));
    const row = (await allEntries()).at(-1)!;
    expect(row).toMatchObject({
      kind: "case",
      action: "updated",
      subjectId: fx.caseId,
    });
  });

  it("a patch with several ops appends one entry per op, with the actor", async () => {
    const fx = await seedGraphFixture();
    const before = await allEntries();
    await runDomain(
      applyPatchEffect({
        caseId: fx.caseId,
        confidence: "unverified",
        actorId: TEST_ACTOR_ID,
        actorLabel: "Test Actor",
        patch: [
          {
            op: "create",
            resource: "entity",
            id: "00000000-0000-4000-8000-0000000000a1",
            data: { kind: "person", name: "Grace Hopper", slug: "grace" },
          },
          {
            op: "create",
            resource: "claim",
            id: "00000000-0000-4000-8000-0000000000a2",
            data: { entityId: fx.entityId, text: "Coined debugging" },
          },
        ],
      })
    );
    const added = (await allEntries()).slice(before.length);
    expect(added.map((row) => `${row.kind}.${row.action}`)).toEqual([
      "entity.created",
      "claim.created",
    ]);
    expect(added.every((row) => row.actorId === TEST_ACTOR_ID)).toBe(true);
    expect(added[0]?.actorLabel).toBe("Test Actor");
  });

  it("a failing op leaves no entry from the ops before it", async () => {
    const fx = await seedGraphFixture();
    const before = await allEntries();
    await expect(
      runDomain(
        applyPatchEffect({
          caseId: fx.caseId,
          confidence: "unverified",
          patch: [
            {
              op: "create",
              resource: "entity",
              id: "00000000-0000-4000-8000-0000000000a1",
              data: { kind: "person", name: "Grace Hopper", slug: "grace" },
            },
            {
              op: "create",
              resource: "claim",
              id: "00000000-0000-4000-8000-0000000000a2",
              data: {
                entityId: "00000000-0000-4000-8000-0000000000ff",
                text: "Orphan",
              },
            },
          ],
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    expect(await allEntries()).toHaveLength(before.length);
  });
});
