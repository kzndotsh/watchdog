import { beforeEach, describe, expect, it } from "vitest";

import {
  getClaimsByIdsEffect,
  getEventsByIdsEffect,
  getQuestionsByIdsEffect,
} from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { claimsRepo, db, eventsRepo, questionsRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  withSystemHistoryContext,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

/**
 * The by-id reads an update verb makes for a row's version (`claims|events|questions.getMany`):
 * a row of the Case is answered (a retracted Claim too), an id outside it is left out.
 */
describe("child rows by id", () => {
  let caseId: Awaited<ReturnType<typeof seedCase>>["id"];
  let entityId: string;
  let otherCaseId: typeof caseId;

  beforeEach(async () => {
    await resetTestDb();
    const cased = await seedCase(db);
    const other = await seedCase(db);
    caseId = cased.id;
    otherCaseId = other.id;
    entityId = (await seedEntity(db, caseId, { id: testId(50) })).id;
  });

  it("answers the Case's Claims, retracted or not, and none of another Case's", async () => {
    const claim = await withSystemHistoryContext(db, async (tx) =>
      claimsRepo.create(tx, {
        entityId,
        caseId,
        text: "live",
        class: "observation",
        confidence: "unverified",
      })
    );
    if (!claim) throw new Error("claim");
    const rows = await runDomain(
      getClaimsByIdsEffect(caseId, TEST_ORGANIZATION_ID, [claim.id])
    );
    expect(rows.map((row) => row.id)).toEqual([claim.id]);
    expect(rows[0]?.version).toBe(claim.version);
    const foreign = await runDomain(
      getClaimsByIdsEffect(otherCaseId, TEST_ORGANIZATION_ID, [claim.id])
    );
    expect(foreign).toEqual([]);
  });

  it("answers the Case's Events and Questions by id", async () => {
    const event = await withSystemHistoryContext(db, async (tx) =>
      eventsRepo.create(tx, {
        entityId,
        caseId,
        when: "2026-01",
        what: "happened",
        whereText: null,
      })
    );
    const question = await withSystemHistoryContext(db, async (tx) =>
      questionsRepo.create(tx, { entityId, caseId, text: "why?" })
    );
    if (!event || !question) throw new Error("seed");
    const events = await runDomain(
      getEventsByIdsEffect(caseId, TEST_ORGANIZATION_ID, [event.id])
    );
    const questions = await runDomain(
      getQuestionsByIdsEffect(caseId, TEST_ORGANIZATION_ID, [question.id])
    );
    expect(events.map((row) => row.id)).toEqual([event.id]);
    expect(questions.map((row) => row.id)).toEqual([question.id]);
    expect(
      await runDomain(
        getEventsByIdsEffect(caseId, TEST_ORGANIZATION_ID, [testId(999)])
      )
    ).toEqual([]);
  });
});
