import { Effect } from "effect";

import { db, type DbTx } from "@watchdog/db";

import { tryDb, type MapPostgresCatchOpts } from "./postgres-effect";
import { toDomainError, type DomainTag } from "./tagged-errors";

/** This is the only nested `runPromise` for TX bodies. */
export function transact<A>(
  body: (tx: DbTx) => Effect.Effect<A, DomainTag>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, DomainTag> {
  return tryDb(
    () =>
      db.transaction((tx) =>
        Effect.runPromise(body(tx).pipe(Effect.mapError(toDomainError)))
      ),
    opts
  );
}
