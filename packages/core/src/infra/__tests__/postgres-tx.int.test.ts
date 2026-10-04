import { Context, Effect, Exit, Fiber } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  InternalError,
  InvalidError,
  type DomainTag,
} from "@watchdog/core/errors";
import { transact, tryDb } from "@watchdog/core/infra";
import { casesRepo, db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";

class Greeter extends Context.Service<Greeter, { readonly hi: string }>()(
  "test/Greeter"
) {}

function caseExists(id: string): Promise<boolean> {
  return casesRepo.getByIdUnchecked(db, id).then((row) => row !== null);
}

/** The tagged failure `transact` surfaces, unchanged. */
function failWith(error: DomainTag): Promise<DomainTag> {
  return Effect.runPromise(Effect.flip(transact(() => Effect.fail(error))));
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
    const id = await Effect.runPromise(
      transact((tx) =>
        tryDb(() => seedCase(tx, { name: "Committed" })).pipe(
          Effect.map((row) => row.id)
        )
      )
    );
    expect(await caseExists(id)).toBe(true);
  });

  it("runs the body with the caller's services", async () => {
    const greeting = await Effect.runPromise(
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
    let id = "";
    const failure = await Effect.runPromise(
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
    const exit = await Effect.runPromiseExit(transact(() => Effect.die(boom)));
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
    const failure = await Effect.runPromise(
      Effect.flip(transact(() => Effect.fail(error)))
    );
    expect(failure).toBe(error);
  });

  it("interrupting the caller aborts the body and rolls back", async () => {
    let id = "";
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const fiber = Effect.runFork(
      transact((tx) =>
        Effect.gen(function* fiber() {
          const row = yield* tryDb(() => seedCase(tx));
          id = row.id;
          inserted();
          return yield* Effect.never;
        })
      )
    );
    await insertedSignal;
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(await caseExists(id)).toBe(false);
  });

  it("maps a driver constraint error to ConflictError inside the body and rolls back", async () => {
    let firstId = "";
    const failure = await Effect.runPromise(
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
      )
    );
    expect(failure).toBeInstanceOf(ConflictError);
    expect(await caseExists(firstId)).toBe(false);
  });
});
