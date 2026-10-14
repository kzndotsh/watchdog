import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { listEvidenceForCaseEffect } from "@watchdog/core/evidence";
import {
  Db,
  runDomainWith,
  transact,
  tryDb,
  tryDbWith,
} from "@watchdog/core/infra";
import { casesRepo, db } from "@watchdog/db";
import {
  createLogger,
  runWithRequestLogger,
  startRequestTiming,
  type RequestTiming,
} from "@watchdog/log";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  captureStatements,
  resetTestDb,
  seedCase,
  seedEvidence,
  testDb,
} from "@watchdog/test-db";

/** Run `program` as one request: a logger in scope with timing started, as the web middleware does. */
async function asRequest<A>(
  program: () => Promise<A>
): Promise<{ result: A; timing: RequestTiming }> {
  const logger = createLogger();
  return runWithRequestLogger(logger, async () => {
    const snapshot = startRequestTiming(logger);
    const result = await program();
    return { result, timing: snapshot() };
  });
}

describe("request timing through the tryDb seam", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("counts exactly the statements the driver ran, with no change to domain code", async () => {
    const theCase = await seedCase(testDb, {
      name: "Timing",
      slug: "timing",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await Promise.all(
      Array.from({ length: 5 }, () => seedEvidence(testDb, theCase.id))
    );

    // Oracle: the statement log of the test client (BEGIN / COMMIT excluded).
    const oracle = await captureStatements(() =>
      runDomainWith(Db.layer)(
        listEvidenceForCaseEffect(theCase.id, TEST_ORGANIZATION_ID)
      )
    );
    expect(oracle.statements.length).toBeGreaterThan(0);

    const { timing } = await asRequest(() =>
      runDomainWith(Db.layer)(
        listEvidenceForCaseEffect(theCase.id, TEST_ORGANIZATION_ID)
      )
    );
    expect(timing.db.queries).toBe(oracle.statements.length);
    expect(timing.db.ms).toBeGreaterThan(0);
    expect(timing.durationMs).toBeGreaterThanOrEqual(timing.db.ms);
  });

  it("counts statements inside a transaction body, not its BEGIN / COMMIT", async () => {
    const theCase = await seedCase(testDb, {
      name: "Timing tx",
      slug: "timing-tx",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const program = Effect.gen(function* program() {
      yield* tryDb(() => casesRepo.getByIdUnchecked(db, theCase.id));
      yield* tryDbWith((exec) => casesRepo.getByIdUnchecked(exec, theCase.id));
      yield* transact((tx) =>
        Effect.gen(function* program() {
          yield* tryDb(() => casesRepo.getByIdUnchecked(tx, theCase.id));
          yield* tryDb(() => casesRepo.getByIdUnchecked(tx, theCase.id));
        })
      );
    });

    const oracle = await captureStatements(() =>
      runDomainWith(Db.layer)(program)
    );
    expect(oracle.statements).toHaveLength(4);

    const { timing } = await asRequest(() => runDomainWith(Db.layer)(program));
    expect(timing.db.queries).toBe(4);
  });

  it("isolates concurrent requests", async () => {
    const theCase = await seedCase(testDb, {
      name: "Timing iso",
      slug: "timing-iso",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const calls = (n: number) =>
      runDomainWith(Db.layer)(
        Effect.forEach(
          Array.from({ length: n }),
          () => tryDb(() => casesRepo.getByIdUnchecked(db, theCase.id)),
          { discard: true }
        )
      );
    const [a, b] = await Promise.all([
      asRequest(() => calls(2)),
      asRequest(() => calls(6)),
    ]);
    expect(a.timing.db.queries).toBe(2);
    expect(b.timing.db.queries).toBe(6);
  });

  it("runs without a request context (worker, CLI) and records nothing", async () => {
    const theCase = await seedCase(testDb, {
      name: "Timing none",
      slug: "timing-none",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const row = await runDomainWith(Db.layer)(
      tryDb(() => casesRepo.getByIdUnchecked(db, theCase.id))
    );
    expect(row?.id).toBe(theCase.id);
  });
});
