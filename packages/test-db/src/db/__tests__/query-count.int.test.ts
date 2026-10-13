import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { cases, evidence } from "@watchdog/db/schema";
import { testCaseId } from "@watchdog/schemas/testing";

import { testDb } from "../../test-db";
import {
  captureStatements,
  expectNoSeqScanOn,
  expectQueries,
  explainPlan,
} from "../query-count";
import { seqScanRelations } from "../query-shape";
import { resetTestDb } from "../with-test-tx";

const CASE_ID = testCaseId(1);

describe("query counting and plan assertions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("counts each statement of the code path and returns its result", async () => {
    const { result, statements } = await captureStatements(async () => {
      await testDb.select().from(cases);
      return testDb.select().from(evidence).where(eq(evidence.caseId, CASE_ID));
    });
    expect(result).toEqual([]);
    expect(statements).toHaveLength(2);
    expect(statements[1]?.sql).toContain('"evidence"');
    expect(statements[1]?.params).toEqual([CASE_ID]);
  });

  it("leaves transaction control out of the count", async () => {
    const { statements } = await captureStatements(() =>
      testDb.transaction(async (tx) => {
        await tx.select().from(cases);
      })
    );
    expect(statements).toHaveLength(1);
  });

  it("expectQueries passes on an exact count and fails on a different one", async () => {
    await expectQueries(1, () => testDb.select().from(cases));
    await expect(
      expectQueries(2, () => testDb.select().from(cases))
    ).rejects.toThrow(/2 statement/);
  });

  it("expectQueries accepts a ceiling", async () => {
    await expectQueries({ max: 3 }, () => testDb.select().from(cases));
    await expect(
      expectQueries({ max: 0 }, () => testDb.select().from(cases))
    ).rejects.toThrow(/at most 0/);
  });

  it("restores the hook when the code path throws, so the next capture works", async () => {
    await expect(
      captureStatements(() => Promise.reject(new Error("boom")))
    ).rejects.toThrow("boom");
    const { statements } = await captureStatements(() =>
      testDb.select().from(cases)
    );
    expect(statements).toHaveLength(1);
  });

  it("refuses to nest captures", async () => {
    await expect(
      captureStatements(() => captureStatements(() => Promise.resolve(1)))
    ).rejects.toThrow(/nested/);
  });

  it("explains a lookup by an indexed column without a Seq Scan", async () => {
    const { statements } = await captureStatements(() =>
      testDb.select().from(evidence).where(eq(evidence.caseId, CASE_ID))
    );
    const [statement] = statements;
    if (statement === undefined) throw new Error("no statement captured");
    expect(seqScanRelations(await explainPlan(statement))).toEqual([]);
  });

  it("sees a Seq Scan when the filtered column has no index", async () => {
    const { statements } = await captureStatements(() =>
      testDb.select().from(cases).where(eq(cases.name, "nobody"))
    );
    const [statement] = statements;
    if (statement === undefined) throw new Error("no statement captured");
    expect(seqScanRelations(await explainPlan(statement))).toEqual(["cases"]);
    await expect(expectNoSeqScanOn(statements, "cases")).rejects.toThrow(
      /cases/
    );
  });

  it("never explains a write", async () => {
    await expect(
      explainPlan({ sql: 'delete from "cases"', params: [] })
    ).rejects.toThrow(/SELECT/);
  });
});
