import { Cause, Context, Deferred, Effect, Exit, Fiber } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  InternalError,
  InvalidError,
  type DomainTag,
} from "@watchdog/core/errors";
import { Db, outsideTransaction, transact, tryDb } from "@watchdog/core/infra";
import { casesRepo, db } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID, testCaseId } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";

import { runDomain } from "../run-domain";

class Greeter extends Context.Service<Greeter, { readonly hi: string }>()(
  "test/Greeter"
) {}

function caseExists(id: CaseId): Promise<boolean> {
  return casesRepo.getByIdUnchecked(db, id).then((row) => row !== null);
}

/** The tagged failure `transact` surfaces, unchanged. */
function failWith(error: DomainTag): Promise<DomainTag> {
  return runDomain(Effect.flip(transact(() => Effect.fail(error))));
}

describe("transact", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves InternalError raised inside the transaction body", async () => {
    const cause = new Error("driver detail");
    const failure = await failWith(
      new InternalError({ reason: "Failed to create Case", cause })
    );

    expect(failure).toBeInstanceOf(InternalError);
    expect(failure).toMatchObject({ reason: "Failed to create Case", cause });
  });

  it("keeps InvalidError and ConflictError distinct from InternalError", async () => {
    expect(
      await failWith(new InvalidError({ reason: "bad input" }))
    ).toBeInstanceOf(InvalidError);
    expect(
      await failWith(new ConflictError({ reason: "taken" }))
    ).toBeInstanceOf(ConflictError);
  });

  it("returns the body's value and commits", async () => {
    const id = await runDomain(
      transact((tx) =>
        tryDb(() => seedCase(tx, { name: "Committed" })).pipe(
          Effect.map((row) => row.id)
        )
      )
    );
    expect(await caseExists(id)).toBe(true);
  });

  it("runs the body with the caller's services", async () => {
    const greeting = await runDomain(
      transact(() =>
        Effect.gen(function* greeting() {
          return (yield* Greeter).hi;
        })
      ).pipe(Effect.provideService(Greeter, { hi: "hello" }))
    );
    expect(greeting).toBe("hello");
  });

  it("passes the same tagged error instance through and rolls back", async () => {
    const error = new ConflictError({ reason: "taken" });
    let id = testCaseId(0);
    const failure = await runDomain(
      Effect.flip(
        transact((tx) =>
          Effect.gen(function* failure() {
            const row = yield* tryDb(() => seedCase(tx));
            id = row.id;
            return yield* error;
          })
        )
      )
    );
    expect(failure).toBe(error);
    expect(failure._tag).toBe("ConflictError");
    expect(await caseExists(id)).toBe(false);
  });

  it("keeps a body defect a defect and rolls back", async () => {
    const boom = new Error("boom");
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        transact(() => Effect.die(boom)),
        Db.layer
      )
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(Exit.hasDies(exit)).toBe(true);
  });

  it("keeps the typed failure when the rollback rejects with a driver error", async () => {
    const transaction = db.transaction.bind(db) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    vi.spyOn(db, "transaction").mockImplementation(((...args: unknown[]) =>
      // The real transaction rolls back, but the driver then rejects with its
      // own error instead of the body's rejection.
      transaction(...args).then(
        (value) => value,
        () => {
          throw new Error("rollback failed: connection lost");
        }
      )) as typeof db.transaction);
    const error = new ConflictError({ reason: "taken" });
    const failure = await runDomain(
      Effect.flip(transact(() => Effect.fail(error)))
    );
    expect(failure).toBe(error);
  });

  it("interrupting the caller aborts the body and rolls back", async () => {
    let id = testCaseId(0);
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const fiber = Effect.runFork(
      Effect.provide(
        transact((tx) =>
          Effect.gen(function* fiber() {
            const row = yield* tryDb(() => seedCase(tx));
            id = row.id;
            inserted();
            return yield* Effect.never;
          })
        ),
        Db.layer
      )
    );
    await insertedSignal;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(await caseExists(id)).toBe(false);
  });

  it("maps a driver constraint error to ConflictError inside the body and rolls back", async () => {
    let firstId = testCaseId(0);
    const failure = await Effect.runPromise(
      Effect.provide(
        Effect.flip(
          transact((tx) =>
            Effect.gen(function* failure() {
              const slugTaken = {
                uniqueIndex: "cases_organization_id_slug_uidx",
                conflictReason: "slug taken",
              };
              const first = yield* tryDb(
                () =>
                  seedCase(tx, {
                    slug: "dup",
                    organizationId: TEST_ORGANIZATION_ID,
                  }),
                slugTaken
              );
              firstId = first.id;
              yield* tryDb(
                () =>
                  seedCase(tx, {
                    slug: "dup",
                    organizationId: TEST_ORGANIZATION_ID,
                  }),
                slugTaken
              );
            })
          )
        ),
        Db.layer
      )
    );
    expect(failure).toBeInstanceOf(ConflictError);
    expect(await caseExists(firstId)).toBe(false);
  });

  it("dies on a nested transact before opening a second transaction", async () => {
    const transaction = vi.spyOn(db, "transaction");
    let id = testCaseId(0);
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        transact((tx) =>
          Effect.gen(function* nested() {
            id = (yield* tryDb(() => seedCase(tx))).id;
            return yield* transact(() => Effect.void);
          })
        ),
        Db.layer
      )
    );
    expect(Exit.hasDies(exit)).toBe(true);
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
      message: expect.stringContaining("inside another transact"),
    });
    // Only the outer transaction was opened, and it rolled back.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(await caseExists(id)).toBe(false);
  });

  it("lets a detached fiber forked inside a body run its own transact", async () => {
    const transaction = vi.spyOn(db, "transaction");
    let outerId = testCaseId(0);
    let innerId = testCaseId(0);
    let detachedExit: Exit.Exit<unknown, unknown> | undefined;
    const outcome = await Effect.runPromiseExit(
      Effect.provide(
        transact((tx) =>
          Effect.gen(function* outer() {
            outerId = (yield* tryDb(() => seedCase(tx, { name: "Outer" }))).id;
            const done = yield* Deferred.make<undefined>();
            yield* outsideTransaction(
              transact((inner) =>
                tryDb(() => seedCase(inner, { name: "Detached" })).pipe(
                  Effect.tap((row) =>
                    Effect.sync(() => {
                      innerId = row.id;
                    })
                  ),
                  Effect.asVoid
                )
              )
            ).pipe(
              Effect.exit,
              Effect.flatMap((exit) =>
                Effect.sync(() => {
                  detachedExit = exit;
                }).pipe(Effect.andThen(Deferred.succeed(done, undefined)))
              ),
              Effect.forkDetach({ startImmediately: true })
            );
            yield* Deferred.await(done);
          })
        ),
        Db.layer
      )
    );
    expect(Exit.isSuccess(outcome)).toBe(true);
    // The guard did not fire: the detached fiber opened its own transaction.
    expect(detachedExit && Exit.isSuccess(detachedExit)).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(await caseExists(outerId)).toBe(true);
    expect(await caseExists(innerId)).toBe(true);
  });

  it("still dies for a forked child the body awaits", async () => {
    const transaction = vi.spyOn(db, "transaction");
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        transact(() =>
          Effect.gen(function* outer() {
            const child = yield* Effect.forkChild(transact(() => Effect.void));
            return yield* Fiber.join(child);
          })
        ),
        Db.layer
      )
    );
    expect(Exit.hasDies(exit)).toBe(true);
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
      message: expect.stringContaining("inside another transact"),
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("dies on a Db.layerOf(tx) transact inside a body", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        transact((tx) =>
          Effect.provide(
            transact(() => Effect.void),
            Db.layerOf(tx)
          )
        ),
        Db.layer
      )
    );
    expect(Exit.hasDies(exit)).toBe(true);
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toMatchObject({
      message: expect.stringContaining("inside another transact"),
    });
  });

  it("allows a transact after another has finished, and under a provided tx", async () => {
    await runDomain(
      transact(() => Effect.void).pipe(
        Effect.andThen(transact(() => Effect.void))
      )
    );
    // A caller-provided tx makes this transact the outermost one (a savepoint).
    const value = await db.transaction((tx) =>
      Effect.runPromise(
        Effect.provide(
          transact(() => Effect.succeed("inner")),
          Db.layerOf(tx)
        )
      )
    );
    expect(value).toBe("inner");
  });
});
