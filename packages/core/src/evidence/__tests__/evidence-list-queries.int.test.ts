import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { evidenceList } from "@watchdog/schemas/evidence";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  captureStatements,
  expectNoSeqScanOn,
  expectQueries,
  resetTestDb,
  seedCase,
  seedAuthUser,
  seedEvidence,
  testDb,
} from "@watchdog/test-db";

import { listEvidenceEffect } from "../evidence-list";

/**
 * The worked example for the query-count and plan assertions in the testing standards: the
 * Case-scoped Evidence list is a hot path (Collect and Triage open it on every Case switch).
 */
describe("listEvidenceEffect: query budget and plan", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  /** Session-authored Evidence: a UUID actor id with an `auth.user` row, so the actor-name lookup runs. */
  async function seedCaseWithEvidence(rows: number) {
    const actorId = randomUUID();
    await seedAuthUser(testDb, {
      id: actorId,
      name: "Budget Actor",
      email: `${actorId}@example.invalid`,
    });
    const theCase = await seedCase(testDb, {
      name: "Budget",
      slug: "budget",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await Promise.all(
      Array.from({ length: rows }, () =>
        seedEvidence(testDb, theCase.id, { actorId })
      )
    );
    return theCase.id;
  }

  const list = (caseId: Parameters<typeof listEvidenceEffect>[0]) =>
    runDomainWith(Db.layer)(
      listEvidenceEffect(
        caseId,
        TEST_ORGANIZATION_ID,
        evidenceList.input.parse({ caseId })
      ).pipe(Effect.map((page) => page.items))
    );

  it("runs a fixed number of statements however many rows it returns", async () => {
    const caseId = await seedCaseWithEvidence(5);
    // The Case guard, one Evidence read and one actor-name lookup: nothing per row.
    const rows = await expectQueries(3, () => list(caseId));
    expect(rows).toHaveLength(5);
    expect(rows[0]?.actorLabel).toBe("budget-actor");
  });

  it("reads Evidence and the Case guard through indexes", async () => {
    const caseId = await seedCaseWithEvidence(1);
    const { statements } = await captureStatements(() => list(caseId));
    await expectNoSeqScanOn(statements, "evidence");
    await expectNoSeqScanOn(statements, "cases");
  });
});
