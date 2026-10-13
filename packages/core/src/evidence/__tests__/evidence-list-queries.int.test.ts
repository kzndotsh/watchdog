import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  captureStatements,
  expectNoSeqScanOn,
  expectQueries,
  resetTestDb,
  seedCase,
  seedEvidence,
  testDb,
} from "@watchdog/test-db";

import { listEvidenceForCaseEffect } from "../evidence";

/**
 * The worked example for the query-count and plan assertions in the testing standards: the
 * Case-scoped Evidence list is a hot path (Collect and Triage open it on every Case switch).
 */
describe("listEvidenceForCaseEffect: query budget and plan", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function seedCaseWithEvidence(rows: number) {
    const theCase = await seedCase(testDb, {
      name: "Budget",
      slug: "budget",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await Promise.all(
      Array.from({ length: rows }, () => seedEvidence(testDb, theCase.id))
    );
    return theCase.id;
  }

  const list = (caseId: Parameters<typeof listEvidenceForCaseEffect>[0]) =>
    runDomainWith(Db.layer)(
      listEvidenceForCaseEffect(caseId, TEST_ORGANIZATION_ID)
    );

  it("runs a fixed number of statements however many rows it returns", async () => {
    const caseId = await seedCaseWithEvidence(5);
    // The Case guard and one Evidence read: nothing per row.
    const rows = await expectQueries(2, () => list(caseId));
    expect(rows).toHaveLength(5);
  });

  it("reads Evidence and the Case guard through indexes", async () => {
    const caseId = await seedCaseWithEvidence(1);
    const { statements } = await captureStatements(() => list(caseId));
    await expectNoSeqScanOn(statements, "evidence");
    await expectNoSeqScanOn(statements, "cases");
  });
});
