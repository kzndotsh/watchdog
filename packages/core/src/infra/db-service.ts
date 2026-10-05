import { Context, Layer } from "effect";

import { db, type DbExec } from "@watchdog/db";

/**
 * The database client as an Effect service (ADR-0002 phase 2). The value is a
 * `DbExec`, the same handle repos take first, so a test can provide the pool
 * or a transaction. It is the pool handle, not a transaction: a transaction
 * handle still arrives as an explicit `tx` / `exec` parameter (`transact`).
 *
 * Read it with `tryDbWith` (error mapping included) or `yield* Db`.
 */
export class Db extends Context.Service<Db, DbExec>()(
  "@watchdog/core/infra/Db"
) {
  /** Live Layer over the process-global `@watchdog/db` client. */
  static readonly layer = Layer.succeed(Db, Db.of(db));

  /**
   * Provide any `DbExec` (a transaction, or a spying wrapper) instead of the
   * pool. For tests: `runDomainWith(Db.layerOf(spy))(effect)`.
   */
  static layerOf(exec: DbExec): Layer.Layer<Db> {
    return Layer.succeed(Db, Db.of(exec));
  }
}
