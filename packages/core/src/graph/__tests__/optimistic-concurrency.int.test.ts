import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { StaleVersionError, type DomainTag } from "@watchdog/core/errors";
import {
  applyPatchEffect,
  updateClaimEffect,
  updateEdgeEffect,
  updateEntityFieldsEffect,
  updateEventEffect,
  updateIdentifierEffect,
  updateQuestionEffect,
} from "@watchdog/core/graph";
import { runDomain, type Db } from "@watchdog/core/infra";
import {
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  identifiersRepo,
  questionsRepo,
} from "@watchdog/db";
import { resetTestDb, seedEvidence } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { seedGraphFixture, type GraphFixture } from "./graph-mutations";

/**
 * #307: two clients read a row at the same version and both save. Exactly one wins; the other
 * gets `StaleVersionError` (`stale_version`) carrying the version the row is at now, and its
 * write is not applied.
 */

type TwoWriter = {
  name: string;
  version: (fx: GraphFixture) => Promise<number | undefined>;
  edit: (
    fx: GraphFixture,
    expectedVersion: number,
    label: string
  ) => Effect.Effect<unknown, DomainTag, Db>;
  /** The stored text the winner wrote, to prove the loser's did not land. */
  stored: (fx: GraphFixture) => Promise<string | null | undefined>;
};

const scope = (fx: GraphFixture) => ({
  caseId: fx.caseId,
  organizationId: fx.organizationId,
  actorId: TEST_ACTOR_ID,
});

const TABLES: readonly TwoWriter[] = [
  {
    name: "entities",
    version: async (fx) =>
      (await entitiesRepo.getInCase(db, fx.caseId, fx.entityId))?.version,
    edit: (fx, expectedVersion, label) =>
      updateEntityFieldsEffect({
        ...scope(fx),
        entityId: fx.entityId,
        expectedVersion,
        summary: label,
      }),
    stored: async (fx) =>
      (await entitiesRepo.getInCase(db, fx.caseId, fx.entityId))?.summary,
  },
  {
    name: "claims",
    version: async (fx) =>
      (await claimsRepo.getInCase(db, fx.caseId, fx.claimId))?.version,
    edit: (fx, expectedVersion, label) =>
      updateClaimEffect({
        ...scope(fx),
        claimId: fx.claimId,
        expectedVersion,
        text: label,
      }),
    stored: async (fx) =>
      (await claimsRepo.getInCase(db, fx.caseId, fx.claimId))?.text,
  },
  {
    name: "identifiers",
    version: async (fx) =>
      (await identifiersRepo.getInCase(db, fx.caseId, fx.identifierId))
        ?.version,
    edit: (fx, expectedVersion, label) =>
      updateIdentifierEffect({
        ...scope(fx),
        identifierId: fx.identifierId,
        expectedVersion,
        notes: label,
      }),
    stored: async (fx) =>
      (await identifiersRepo.getInCase(db, fx.caseId, fx.identifierId))?.notes,
  },
  {
    name: "edges",
    version: async (fx) =>
      (await edgesRepo.getInCase(db, fx.caseId, fx.edgeId))?.version,
    edit: (fx, expectedVersion, label) =>
      updateEdgeEffect({
        ...scope(fx),
        edgeId: fx.edgeId,
        expectedVersion,
        notes: label,
      }),
    stored: async (fx) =>
      (await edgesRepo.getInCase(db, fx.caseId, fx.edgeId))?.notes,
  },
  {
    name: "events",
    version: async (fx) =>
      (await eventsRepo.getInCase(db, fx.caseId, fx.eventId))?.version,
    edit: (fx, expectedVersion, label) =>
      updateEventEffect({
        ...scope(fx),
        eventId: fx.eventId,
        expectedVersion,
        what: label,
      }),
    stored: async (fx) =>
      (await eventsRepo.getInCase(db, fx.caseId, fx.eventId))?.what,
  },
  {
    name: "questions",
    version: async (fx) =>
      (await questionsRepo.getInCase(db, fx.caseId, fx.questionId))?.version,
    edit: (fx, expectedVersion, label) =>
      updateQuestionEffect({
        ...scope(fx),
        questionId: fx.questionId,
        expectedVersion,
        text: label,
      }),
    stored: async (fx) =>
      (await questionsRepo.getInCase(db, fx.caseId, fx.questionId))?.text,
  },
];

describe("optimistic concurrency on Graph edits", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  describe.each(TABLES)("$name", (table) => {
    it("two writers holding the same version: exactly one wins, the other gets stale_version", async () => {
      const fx = await seedGraphFixture();
      const read = await table.version(fx);
      expect(read).toBe(1);
      const settled = await Promise.allSettled(
        ["writer A", "writer B"].map(async (label) =>
          runDomain(table.edit(fx, 1, label))
        )
      );
      const won = settled.filter((r) => r.status === "fulfilled");
      const lost = settled.filter((r) => r.status === "rejected");
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      const reason: unknown = lost[0]?.reason;
      expect(reason).toBeInstanceOf(StaleVersionError);
      expect(reason).toMatchObject({
        code: "stale_version",
        currentVersion: 2,
      });
      expect(await table.version(fx)).toBe(2);
      expect(["writer A", "writer B"]).toContain(await table.stored(fx));
    });

    it("a write at the current version succeeds and bumps it by one", async () => {
      const fx = await seedGraphFixture();
      await runDomain(table.edit(fx, 1, "first"));
      await runDomain(table.edit(fx, 2, "second"));
      expect(await table.version(fx)).toBe(3);
      expect(await table.stored(fx)).toBe("second");
    });

    it("a write at an old version is refused and changes nothing", async () => {
      const fx = await seedGraphFixture();
      await runDomain(table.edit(fx, 1, "winner"));
      await expect(runDomain(table.edit(fx, 1, "late"))).rejects.toMatchObject({
        _tag: "StaleVersionError",
        currentVersion: 2,
      });
      expect(await table.stored(fx)).toBe("winner");
      expect(await table.version(fx)).toBe(2);
    });
  });

  describe("an edit that replaces Evidence", () => {
    it("claims: the version is checked before the Evidence set is replaced", async () => {
      const fx = await seedGraphFixture();
      const evidence = await seedEvidence(db, fx.caseId, { label: "a" });
      await runDomain(
        updateClaimEffect({
          ...scope(fx),
          claimId: fx.claimId,
          expectedVersion: 1,
          text: "winner",
        })
      );
      await expect(
        runDomain(
          updateClaimEffect({
            ...scope(fx),
            claimId: fx.claimId,
            expectedVersion: 1,
            evidenceIds: [evidence.id],
          })
        )
      ).rejects.toMatchObject({ _tag: "StaleVersionError" });
      const current = await runDomain(
        updateClaimEffect({
          ...scope(fx),
          claimId: fx.claimId,
          expectedVersion: 2,
          evidenceIds: [evidence.id],
        })
      );
      expect(current.evidenceIds).toEqual([evidence.id]);
      // The Evidence link bumped the version once more; the record says so.
      expect(current.version).toBe(
        (await claimsRepo.getInCase(db, fx.caseId, fx.claimId))?.version
      );
    });

    it("identifiers and edges: a stale Evidence-only edit is refused", async () => {
      const fx = await seedGraphFixture();
      const evidence = await seedEvidence(db, fx.caseId, { label: "b" });
      await runDomain(
        updateIdentifierEffect({
          ...scope(fx),
          identifierId: fx.identifierId,
          expectedVersion: 1,
          notes: "moved on",
        })
      );
      await runDomain(
        updateEdgeEffect({
          ...scope(fx),
          edgeId: fx.edgeId,
          expectedVersion: 1,
          notes: "moved on",
        })
      );
      await expect(
        runDomain(
          updateIdentifierEffect({
            ...scope(fx),
            identifierId: fx.identifierId,
            expectedVersion: 1,
            evidenceIds: [evidence.id],
          })
        )
      ).rejects.toMatchObject({ _tag: "StaleVersionError" });
      await expect(
        runDomain(
          updateEdgeEffect({
            ...scope(fx),
            edgeId: fx.edgeId,
            expectedVersion: 1,
            evidenceIds: [evidence.id],
          })
        )
      ).rejects.toMatchObject({ _tag: "StaleVersionError" });
    });
  });

  describe("patch ops (graph.write and Triage Accept)", () => {
    const entityUpdate = (
      fx: GraphFixture,
      summary: string,
      version?: number
    ) =>
      applyPatchEffect({
        caseId: fx.caseId,
        channel: "agent_write",
        confidence: "unverified",
        actor: { actorId: TEST_ACTOR_ID },
        patch: [
          {
            op: "update",
            resource: "entity",
            id: fx.entityId,
            data: { summary },
            ...(version === undefined ? {} : { expectedVersion: version }),
          },
        ],
      });

    it("an op without expectedVersion overwrites the row as it stands", async () => {
      const fx = await seedGraphFixture();
      await runDomain(entityUpdate(fx, "one"));
      await runDomain(entityUpdate(fx, "two"));
      const row = await entitiesRepo.getInCase(db, fx.caseId, fx.entityId);
      expect(row?.summary).toBe("two");
      expect(row?.version).toBe(3);
    });

    it("an op with a stale expectedVersion fails the whole patch with stale_version", async () => {
      const fx = await seedGraphFixture();
      await runDomain(entityUpdate(fx, "one"));
      await expect(
        runDomain(entityUpdate(fx, "late", 1))
      ).rejects.toMatchObject({ _tag: "StaleVersionError", currentVersion: 2 });
      expect(
        (await entitiesRepo.getInCase(db, fx.caseId, fx.entityId))?.summary
      ).toBe("one");
    });

    it("an op at the current version applies", async () => {
      const fx = await seedGraphFixture();
      await runDomain(entityUpdate(fx, "one"));
      await runDomain(entityUpdate(fx, "two", 2));
      expect(
        (await entitiesRepo.getInCase(db, fx.caseId, fx.entityId))?.summary
      ).toBe("two");
    });
  });
});
