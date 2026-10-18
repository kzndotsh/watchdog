import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  deleteEdgeEffect,
  deleteEntityEffect,
  deleteEventEffect,
  deleteIdentifierEffect,
  deleteQuestionEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  retractClaimEffect,
  updateIdentifierEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import {
  activityLogRepo,
  db,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  graphHistoryRepo,
  identifiersRepo,
  questionsRepo,
} from "@watchdog/db";
import { resetTestDb } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { seedGraphFixture } from "./graph-mutations";

/**
 * Races the S4 review found in the Graph appends. Each is forced rather than
 * left to timing: a repo call is wrapped so the competing write lands exactly
 * between the function's existence read and its transaction.
 */

const START = { xid: "0", id: 0 } as const;

async function entriesFor(subjectId: string) {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.subjectId === subjectId);
}

/**
 * Lands `write` after the function's existence read and before its transaction
 * takes the row lock (the first thing the transaction does is capture the row
 * `FOR UPDATE` for the history). A writer that arrives once the lock is held
 * simply waits for the commit, so the race that can still happen is this one.
 */
function raceBeforeLock(write: () => Promise<unknown>) {
  const real = graphHistoryRepo.snapshot.bind(graphHistoryRepo);
  vi.spyOn(graphHistoryRepo, "snapshot").mockImplementationOnce(
    async (...args) => {
      await write();
      return real(...args);
    }
  );
}

/** The rejection of the one settled promise that lost, which must be a Conflict. */
function expectConflictLoser(settled: PromiseSettledResult<unknown>[]) {
  expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const lost = settled.find((r) => r.status === "rejected");
  expect(isDomainTag(lost?.reason) && lost.reason.code === "conflict").toBe(
    true
  );
}

describe("Graph activity races", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("a delete entry labels the row the delete returned", () => {
    it("entity: renamed between the existence read and the delete", async () => {
      const fx = await seedGraphFixture();
      raceBeforeLock(() =>
        entitiesRepo.update(db, fx.otherEntityId, { name: "Renamed" })
      );
      await runDomain(
        deleteEntityEffect(fx.caseId, fx.organizationId, fx.otherEntityId)
      );
      expect((await entriesFor(fx.otherEntityId)).at(-1)).toMatchObject({
        action: "deleted",
        label: "Renamed",
      });
    });

    it("timeline Event: reworded between the existence read and the delete", async () => {
      const fx = await seedGraphFixture();
      raceBeforeLock(() =>
        eventsRepo.update(db, fx.eventId, {
          when: "1815-12-10",
          what: "Reworded",
        })
      );
      await runDomain(
        deleteEventEffect(fx.caseId, fx.organizationId, fx.eventId)
      );
      expect((await entriesFor(fx.eventId)).at(-1)).toMatchObject({
        action: "deleted",
        label: "Reworded",
      });
    });

    it("Identifier: value changed between the existence read and the delete", async () => {
      const fx = await seedGraphFixture();
      raceBeforeLock(() =>
        identifiersRepo.update(db, fx.identifierId, {
          value: "changed@mailhost.test",
        })
      );
      await runDomain(
        deleteIdentifierEffect(fx.caseId, fx.organizationId, fx.identifierId)
      );
      expect((await entriesFor(fx.identifierId)).at(-1)).toMatchObject({
        action: "deleted",
        label: "changed@mailhost.test",
      });
    });

    it("Open Question: edited between the existence read and the delete", async () => {
      const fx = await seedGraphFixture();
      raceBeforeLock(() =>
        questionsRepo.update(db, fx.questionId, { text: "Edited?" })
      );
      await runDomain(
        deleteQuestionEffect(fx.caseId, fx.organizationId, fx.questionId)
      );
      expect((await entriesFor(fx.questionId)).at(-1)).toMatchObject({
        action: "deleted",
        label: "Edited?",
      });
    });

    it("Edge: predicate changed between the existence read and the delete", async () => {
      const fx = await seedGraphFixture();
      raceBeforeLock(() =>
        edgesRepo.update(db, fx.edgeId, { predicate: "owns" })
      );
      await runDomain(
        deleteEdgeEffect(fx.caseId, fx.organizationId, fx.edgeId)
      );
      expect((await entriesFor(fx.edgeId)).at(-1)).toMatchObject({
        action: "deleted",
        label: "owns",
      });
    });
  });

  describe("concurrent Question status writes append once", () => {
    it("two concurrent resolves: one wins, the other is a conflict", async () => {
      const fx = await seedGraphFixture();
      // Both calls are past the existence read before either transaction runs;
      // the row lock makes the second wait for the first, then lose the
      // `status = 'open'` check.
      const input = {
        caseId: fx.caseId,
        organizationId: fx.organizationId,
        questionId: fx.questionId,
        resolvedNote: "London",
      };
      const settled = await Promise.allSettled([
        runDomain(resolveQuestionEffect(input)),
        runDomain(resolveQuestionEffect(input)),
      ]);
      expectConflictLoser(settled);
      const resolved = (await entriesFor(fx.questionId)).filter(
        (row) => row.action === "resolved"
      );
      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        fromValue: "open",
        toValue: "resolved",
      });
    });

    it("two concurrent reopens: one wins, the other is a conflict", async () => {
      const fx = await seedGraphFixture();
      const input = {
        caseId: fx.caseId,
        organizationId: fx.organizationId,
        questionId: fx.resolvedQuestionId,
      };
      const before = (await entriesFor(fx.resolvedQuestionId)).length;
      const settled = await Promise.allSettled([
        runDomain(reopenQuestionEffect(input)),
        runDomain(reopenQuestionEffect(input)),
      ]);
      expectConflictLoser(settled);
      expect((await entriesFor(fx.resolvedQuestionId)).length - before).toBe(1);
    });

    it("a resolve that loses to a delete is not found and appends nothing", async () => {
      const fx = await seedGraphFixture();
      raceBeforeLock(() => questionsRepo.delete(db, fx.questionId));
      await expect(
        runDomain(
          resolveQuestionEffect({
            caseId: fx.caseId,
            organizationId: fx.organizationId,
            questionId: fx.questionId,
          })
        )
      ).rejects.toSatisfy(
        (error: unknown) => isDomainTag(error) && error.code === "not_found"
      );
      expect(
        (await entriesFor(fx.questionId)).filter(
          (row) => row.action === "resolved"
        )
      ).toEqual([]);
    });
  });

  describe("concurrent Claim retracts append once", () => {
    it("two concurrent retracts: one wins, the other is a conflict", async () => {
      const fx = await seedGraphFixture();
      const input = {
        caseId: fx.caseId,
        organizationId: fx.organizationId,
        claimId: fx.claimId,
        kind: "retracted" as const,
        reason: "Wrong person",
      };
      const settled = await Promise.allSettled([
        runDomain(retractClaimEffect(input, TEST_ACTOR_ID)),
        runDomain(retractClaimEffect(input, TEST_ACTOR_ID)),
      ]);
      expectConflictLoser(settled);
      expect(
        (await entriesFor(fx.claimId)).filter(
          (row) => row.action === "retracted"
        )
      ).toHaveLength(1);
    });
  });

  describe("Identifier updates", () => {
    it("an evidence-only update racing a delete leaves no entry for the deleted subject", async () => {
      const fx = await seedGraphFixture();
      // The delete commits after the update's existence read and before its lock.
      raceBeforeLock(() =>
        runDomain(
          deleteIdentifierEffect(fx.caseId, fx.organizationId, fx.identifierId)
        )
      );
      await expect(
        runDomain(
          updateIdentifierEffect({
            caseId: fx.caseId,
            organizationId: fx.organizationId,
            identifierId: fx.identifierId,
            evidenceIds: [],
          })
        )
      ).rejects.toSatisfy(
        (error: unknown) => isDomainTag(error) && error.code === "not_found"
      );
      const actions = (await entriesFor(fx.identifierId)).map(
        (row) => row.action
      );
      expect(actions).toEqual(["created", "deleted"]);
    });

    it("an update with no Identifier column to write appends nothing, as before the log", async () => {
      const fx = await seedGraphFixture();
      const before = await entriesFor(fx.identifierId);
      const record = await runDomain(
        updateIdentifierEffect({
          caseId: fx.caseId,
          organizationId: fx.organizationId,
          identifierId: fx.identifierId,
          evidenceIds: [],
          actorId: TEST_ACTOR_ID,
        })
      );
      expect(record.evidenceIds).toEqual([]);
      expect(await entriesFor(fx.identifierId)).toHaveLength(before.length);
    });
  });
});
