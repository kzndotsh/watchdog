import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import {
  deleteIdentifierEffect,
  resolveQuestionEffect,
  updateIdentifierEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { db, identifiersRepo, questionsRepo } from "@watchdog/db";
import {
  listAllActivity,
  resetTestDb,
  withSystemHistoryContext,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { seedGraphFixture } from "./graph-mutations";

/**
 * Races the S4 review found in the Graph appends that the module's conformance suite does not
 * reach: a resolve losing to a delete, and the Identifier update paths. Each is forced rather
 * than left to timing: a repo call is wrapped so the competing write lands exactly before it.
 * (Delete labels and two concurrent transitions are conformance cases, `graph/mutation/__tests__`.)
 */

async function entriesFor(subjectId: string) {
  const rows = await listAllActivity();
  return rows.filter((row) => row.subjectId === subjectId);
}

describe("Graph activity races", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("concurrent Question status writes append once", () => {
    it("a resolve that loses to a delete is not found and appends nothing", async () => {
      const fx = await seedGraphFixture();
      const real = questionsRepo.resolveInCase.bind(questionsRepo);
      vi.spyOn(questionsRepo, "resolveInCase").mockImplementationOnce(
        async (...args) => {
          await withSystemHistoryContext(db, (tx) =>
            questionsRepo.delete(tx, fx.questionId)
          );
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
    it("an evidence-only update racing a delete is a NotFound and leaves no entry for the deleted subject", async () => {
      const fx = await seedGraphFixture();
      const real = identifiersRepo.lockAtVersionInCase.bind(identifiersRepo);
      vi.spyOn(identifiersRepo, "lockAtVersionInCase").mockImplementationOnce(
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
      await expect(
        runDomain(
          updateIdentifierEffect({
            caseId: fx.caseId,
            organizationId: fx.organizationId,
            identifierId: fx.identifierId,
            expectedVersion: 1,
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

    it("an update with no Identifier column to write appends one `updated` entry", async () => {
      const fx = await seedGraphFixture();
      const before = await entriesFor(fx.identifierId);
      const record = await runDomain(
        updateIdentifierEffect({
          caseId: fx.caseId,
          organizationId: fx.organizationId,
          identifierId: fx.identifierId,
          expectedVersion: 1,
          evidenceIds: [],
          actorId: TEST_ACTOR_ID,
        })
      );
      expect(record.evidenceIds).toEqual([]);
      const added = (await entriesFor(fx.identifierId)).slice(before.length);
      expect(added.map((row) => row.action)).toEqual(["updated"]);
    });
  });
});
