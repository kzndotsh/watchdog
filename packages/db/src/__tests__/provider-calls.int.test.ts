import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import {
  expectPostgresRefusal,
  PG_FOREIGN_KEY_VIOLATION,
  PG_INSUFFICIENT_PRIVILEGE,
  seedCase,
  seedEvidence,
  seedJob,
  testDb,
  withSystemTestTx,
} from "@watchdog/test-db";

import type { DbTx } from "../exec";
import {
  providerCallsRepo,
  type NewProviderCall,
} from "../repos/provider-calls.repo";

/*
 * Provider calls (#495): the request side, the outcome and the Evidence link are append-only by
 * privilege (the tests connect as the application role), idempotent to write, and Case-scoped by
 * composite keys.
 */

function request(
  caseId: CaseId,
  jobId: string,
  overrides: Partial<NewProviderCall> = {}
): NewProviderCall {
  return {
    id: randomUUID(),
    caseId,
    jobId,
    runId: randomUUID(),
    seq: 0,
    transport: "http",
    method: "GET",
    urlRedacted: "https://provider.test/v1/host?key=[redacted]",
    bodyKind: "response",
    requestBodyState: "none",
    startedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function seededCall(tx: DbTx) {
  const cased = await seedCase(tx);
  const job = await seedJob(tx, cased.id, { status: "running" });
  const evidence = await seedEvidence(tx, cased.id);
  const call = request(cased.id, job.id);
  await providerCallsRepo.insertRequest(tx, call);
  return { cased, job, evidence, call };
}

describe("the provider call repo", () => {
  it("writes the request side once and an outcome once: a repeat is a no-op", async () => {
    await withSystemTestTx(async (tx) => {
      const { cased, call } = await seededCall(tx);

      expect(await providerCallsRepo.insertRequest(tx, call)).toBe(false);
      const outcome = {
        callId: call.id,
        caseId: cased.id,
        outcome: "response" as const,
        status: 200,
        hops: [],
        responseHeaders: {},
        startedAt: call.startedAt,
        bodyState: "none" as const,
        endedAt: new Date("2026-01-01T00:00:01Z"),
      };
      expect(await providerCallsRepo.insertOutcome(tx, outcome)).toBe(true);
      expect(
        await providerCallsRepo.insertOutcome(tx, { ...outcome, status: 500 })
      ).toBe(false);

      const [row] = await providerCallsRepo.listForJob(
        tx,
        cased.id,
        call.jobId
      );
      expect(row?.outcome?.status).toBe(200);
    });
  });

  it("links Evidence to calls, and a link of the Evidence of another Case is refused", async () => {
    await withSystemTestTx(async (tx) => {
      const { cased, evidence, call } = await seededCall(tx);
      const other = await seedCase(tx, { slug: "other-case" });
      const foreign = await seedEvidence(tx, other.id);

      expect(
        await providerCallsRepo.linkEvidence(
          tx,
          cased.id,
          [evidence.id],
          [call.id]
        )
      ).toBe(1);
      expect(
        await providerCallsRepo.linkEvidence(
          tx,
          cased.id,
          [evidence.id],
          [call.id]
        )
      ).toBe(0);
      const [linked] = await providerCallsRepo.listForEvidence(
        tx,
        cased.id,
        evidence.id
      );
      expect(linked?.call.id).toBe(call.id);

      await expectPostgresRefusal(
        providerCallsRepo.linkEvidence(tx, cased.id, [foreign.id], [call.id]),
        { code: PG_FOREIGN_KEY_VIOLATION }
      );
    });
  });

  it("refuses an outcome whose Case is not the call's", async () => {
    await withSystemTestTx(async (tx) => {
      const { call } = await seededCall(tx);
      const other = await seedCase(tx, { slug: "other-case" });
      await expectPostgresRefusal(
        providerCallsRepo.insertOutcome(tx, {
          callId: call.id,
          caseId: other.id,
          outcome: "response",
          hops: [],
          responseHeaders: {},
          startedAt: call.startedAt,
          bodyState: "none",
          endedAt: call.startedAt,
        }),
        { code: PG_FOREIGN_KEY_VIOLATION }
      );
    });
  });
});

describe("the application role", () => {
  it("cannot update or delete a call, an outcome or an Evidence link, and cannot truncate them", async () => {
    const cased = await seedCase(testDb);
    const job = await seedJob(testDb, cased.id, { status: "running" });
    const evidence = await seedEvidence(testDb, cased.id);
    const call = request(cased.id, job.id);
    await providerCallsRepo.insertRequest(testDb, call);
    await providerCallsRepo.insertOutcome(testDb, {
      callId: call.id,
      caseId: cased.id,
      outcome: "response",
      hops: [],
      responseHeaders: {},
      startedAt: call.startedAt,
      bodyState: "none",
      endedAt: call.startedAt,
    });
    await providerCallsRepo.linkEvidence(
      testDb,
      cased.id,
      [evidence.id],
      [call.id]
    );

    const statements = [
      sql`update provider_calls set method = 'POST'`,
      sql`delete from provider_calls`,
      sql`truncate provider_calls`,
      sql`update provider_call_outcomes set status = 500`,
      sql`delete from provider_call_outcomes`,
      sql`truncate provider_call_outcomes`,
      sql`update evidence_provider_calls set call_id = call_id`,
      sql`delete from evidence_provider_calls`,
      sql`truncate evidence_provider_calls`,
    ];
    for (const statement of statements) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one refusal at a time
      await expectPostgresRefusal(testDb.execute(statement), {
        code: PG_INSUFFICIENT_PRIVILEGE,
      });
    }
    const [row] = await providerCallsRepo.listForJob(testDb, cased.id, job.id);
    expect(row?.call.method).toBe("GET");
    expect(row?.outcome?.status).toBeNull();
  });
});

describe("listCacheHits", () => {
  it("answers nothing for a subject id that is not a UUID, without querying on a blank", async () => {
    const cased = await seedCase(testDb);

    expect(
      await providerCallsRepo.listCacheHits(
        testDb,
        cased.id,
        { evidenceId: "not-a-uuid" },
        5
      )
    ).toEqual([]);
    expect(
      await providerCallsRepo.listCacheHits(
        testDb,
        cased.id,
        { jobId: "not-a-uuid" },
        5
      )
    ).toEqual([]);
  });
});
