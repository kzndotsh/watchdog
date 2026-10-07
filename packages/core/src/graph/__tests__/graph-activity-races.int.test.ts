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
  updateIdentifierEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import {
  activityLogRepo,
  db,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  evidenceLinksRepo,
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

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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
      const real = entitiesRepo.deleteInCase.bind(entitiesRepo);
      vi.spyOn(entitiesRepo, "deleteInCase").mockImplementationOnce(
        async (...args) => {
          await entitiesRepo.update(db, fx.otherEntityId, { name: "Renamed" });
          return real(...args);
        }
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
      const real = eventsRepo.deleteInCase.bind(eventsRepo);
      vi.spyOn(eventsRepo, "deleteInCase").mockImplementationOnce(
        async (...args) => {
          await eventsRepo.update(db, fx.eventId, {
            when: "1815-12-10",
            what: "Reworded",
          });
          return real(...args);
        }
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
      const real = identifiersRepo.deleteInCase.bind(identifiersRepo);
      vi.spyOn(identifiersRepo, "deleteInCase").mockImplementationOnce(
        async (...args) => {
          await identifiersRepo.update(db, fx.identifierId, {
            value: "changed@mailhost.test",
          });
          return real(...args);
        }
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
      const real = questionsRepo.deleteInCase.bind(questionsRepo);
      vi.spyOn(questionsRepo, "deleteInCase").mockImplementationOnce(
        async (...args) => {
          await questionsRepo.update(db, fx.questionId, { text: "Edited?" });
          return real(...args);
        }
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
      const real = edgesRepo.deleteInCase.bind(edgesRepo);
      vi.spyOn(edgesRepo, "deleteInCase").mockImplementationOnce(
        async (...args) => {
          await edgesRepo.update(db, fx.edgeId, { predicate: "owns" });
          return real(...args);
        }
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
      // Both pass the existence read before either writes.
      const real = questionsRepo.resolveInCase.bind(questionsRepo);
      vi.spyOn(questionsRepo, "resolveInCase").mockImplementation(
        async (...args) => {
          await sleep(100);
          return real(...args);
        }
      );
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
      expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = settled.find((r) => r.status === "rejected");
      expect(isDomainTag(lost?.reason) && lost.reason.code === "conflict").toBe(
        true
      );
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
      const real = questionsRepo.reopenInCase.bind(questionsRepo);
      vi.spyOn(questionsRepo, "reopenInCase").mockImplementation(
        async (...args) => {
          await sleep(100);
          return real(...args);
        }
      );
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
      expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await entriesFor(fx.resolvedQuestionId)).length - before).toBe(1);
    });

    it("a resolve that loses to a delete is not found and appends nothing", async () => {
      const fx = await seedGraphFixture();
      const real = questionsRepo.resolveInCase.bind(questionsRepo);
      vi.spyOn(questionsRepo, "resolveInCase").mockImplementationOnce(
        async (...args) => {
          await questionsRepo.delete(db, fx.questionId);
          return real(...args);
        }
      );
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

  describe("Identifier updates", () => {
    it("an evidence-only update racing a delete leaves no entry for the deleted subject", async () => {
      const fx = await seedGraphFixture();
      const real = evidenceLinksRepo.replaceIdentifier.bind(evidenceLinksRepo);
      vi.spyOn(evidenceLinksRepo, "replaceIdentifier").mockImplementationOnce(
        async (...args) => {
          // The delete commits after the update's existence read and before its write.
          await runDomain(
            deleteIdentifierEffect(
              fx.caseId,
              fx.organizationId,
              fx.identifierId
            )
          );
          return real(...args);
        }
      );
      await runDomain(
        updateIdentifierEffect({
          caseId: fx.caseId,
          organizationId: fx.organizationId,
          identifierId: fx.identifierId,
          evidenceIds: [],
        })
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
