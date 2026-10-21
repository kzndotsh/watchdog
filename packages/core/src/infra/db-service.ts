import { Context, Effect, Layer } from "effect";

import {
  acquirePool,
  endPool,
  POOL_END_TIMEOUT_SECONDS,
  type DbExec,
  type Pool,
} from "@watchdog/db";

import { logSwallowed } from "./process-log";

/** A pool source for `Db.ownedBy`: the handle and how to end that same pool. */
export type OwnedPool = {
  readonly db: DbExec;
  readonly end: (timeoutSeconds: number) => Promise<void>;
};

function openProcessPool(): OwnedPool {
  const pool: Pool = acquirePool();
  return { db: pool.db, end: async (timeout) => endPool(pool, timeout) };
}

/**
 * The database client as an Effect service (ADR-0002 phase 2). The value is a
 * `DbExec`, the same handle repos take first, so a test can provide the pool
 * or a transaction. It is the pool handle, not a transaction: a transaction
 * handle still arrives as an explicit `tx` / `exec` parameter (`transact`).
 *
 * Read it with `tryDbWith` (error mapping included) or `yield* Db`.
 *
 * Pool lifetime (ADR-0002 phase 4, #443): each process has one owner of the
 * main pool, `Db.owned`, a scoped Layer whose release ends the client. The
 * worker composes it outside the queue and `JobFibers`; the web runtime
 * (`AppLive`) composes it and is disposed on the dev reload hook. `Db.layer`
 * borrows the same pool without owning it.
 */
export class Db extends Context.Service<Db, DbExec>()(
  "@watchdog/core/infra/Db"
) {
  /**
   * The pool's owner: acquire opens (or reuses) the process pool, release ends
   * it with a bounded timeout (`POOL_END_TIMEOUT_SECONDS`) and clears the
   * process slot. Compose it once per process, outside every Layer whose
   * release still writes (the queue drain, `JobFibers`).
   */
  static readonly owned: Layer.Layer<Db> = Db.ownedBy(openProcessPool);

  /**
   * An owner Layer over any pool source (`Db.owned` uses the process pool). The
   * release calls `end` once, with `POOL_END_TIMEOUT_SECONDS`; tests pass their
   * own source to observe the release without touching the process pool.
   */
  static ownedBy(open: () => OwnedPool): Layer.Layer<Db> {
    return Layer.effect(
      Db,
      Effect.acquireRelease(Effect.sync(open), (pool) =>
        // A failed end is logged, never a defect: shutdown goes on to the next finalizer.
        Effect.tryPromise({
          try: async () => pool.end(POOL_END_TIMEOUT_SECONDS),
          catch: (error) =>
            error instanceof Error ? error : new Error(String(error)),
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              logSwallowed("db.pool", error);
            })
          )
        )
      ).pipe(Effect.map((pool) => pool.db))
    );
  }

  /**
   * The same pool, borrowed: nothing ends it with the Layer. For `runDomain`
   * and tests, which build a Layer per call and must not end the pool the
   * process owner (or the test run) still uses. Reads the process slot lazily,
   * so after the owner ended the pool it opens a fresh one.
   */
  static readonly layer: Layer.Layer<Db> = Layer.sync(Db, () =>
    Db.of(acquirePool().db)
  );

  /**
   * Provide any `DbExec` (a transaction, or a spying wrapper) instead of the
   * pool. For tests: `runDomainWith(Db.layerOf(spy))(effect)`.
   */
  static layerOf(exec: DbExec): Layer.Layer<Db> {
    return Layer.succeed(Db, Db.of(exec));
  }
}

/**
 * The process's shared `DbExec`, for the one caller that must hold the client
 * outside an Effect: Better Auth's Drizzle adapter, built at module load in
 * `apps/web/src/auth/server.ts`. It is the pool `Db.owned` owns (same slot), so
 * web has one pool and one owner. Borrowed: never end it from here.
 */
export function sharedDb(): DbExec {
  return acquirePool().db;
}
