import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { InternalError } from "@watchdog/core/errors";
import { runDomain, transact, tryDb } from "@watchdog/core/infra";
import { db, entitiesRepo, type NewEntity } from "@watchdog/db";
import {
  HISTORY_CONTEXT_MISSING_SQLSTATE,
  type CaseId,
} from "@watchdog/schemas/shared";
import {
  expectPostgresRefusal,
  resetTestDb,
  seedCase,
  withTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { setHistoryContextEffect } from "../../graph/graph-activity";

/*
 * Issue #352: the database refuses a Graph write by the application role with no history
 * context, and the test harness sets none, so a core write path that forgets
 * `setHistoryContextEffect` fails here (and in its own tests) as an InternalError, a server bug.
 */

const newEntity = (caseId: CaseId): NewEntity => ({
  id: testId(700),
  caseId,
  kind: "person",
  name: "Ada",
  slug: "ada",
});

describe("a Graph write that forgot the history context", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("fails as InternalError through tryDb, and writes nothing", async () => {
    const cased = await seedCase(db);
    const error = await runDomain(
      transact((tx) =>
        tryDb(() => entitiesRepo.create(tx, newEntity(cased.id)))
      ).pipe(
        Effect.map(() => "wrote" as const),
        Effect.catch((error) => Effect.succeed(error))
      )
    );
    expect(error).toBeInstanceOf(InternalError);
    expect(error).toMatchObject({
      reason: "Graph write without a history context",
    });
    expect(await entitiesRepo.listForCase(db, cased.id)).toEqual([]);
  });

  it("succeeds once setHistoryContextEffect runs first in the same transaction", async () => {
    const cased = await seedCase(db);
    await runDomain(
      transact((tx) =>
        Effect.gen(function* withContext() {
          yield* setHistoryContextEffect(tx, { channel: "system" });
          yield* tryDb(() => entitiesRepo.create(tx, newEntity(cased.id)));
        })
      )
    );
    expect(await entitiesRepo.listForCase(db, cased.id)).toHaveLength(1);
  });

  it("is not hidden by the harness: withTestTx carries no default context", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await expectPostgresRefusal(
        tx.transaction((inner) =>
          entitiesRepo.create(inner, newEntity(cased.id))
        ),
        { code: HISTORY_CONTEXT_MISSING_SQLSTATE }
      );
    });
  });
});
