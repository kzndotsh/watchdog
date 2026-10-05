import { Cause, Context, Effect } from "effect";

import type { DbTx } from "@watchdog/db";

import { Db } from "./db-service";
import { mapPostgresCatch, type MapPostgresCatchOpts } from "./postgres-effect";
import type { DomainTag } from "./tagged-errors";

/**
 * Rejection thrown from the driver's promise-based `db.transaction` callback
 * so the transaction rolls back. The typed `Cause` travels separately in a
 * closure variable, so the failure is never flattened to `Error`
 * and stays distinguishable from genuine driver errors.
 */
// oxlint-disable-next-line effecttsgo/extends-native-error -- private rollback marker: the driver's promise-based transaction only rolls back when the callback rejects
class TxBodyFailureError extends Error {
  override readonly name = "TxBodyFailureError";
}

/**
 * True while a `transact` body runs, for that body and every fiber it forks.
 * `transact` sets it around the body and checks it before opening a
 * transaction, so a nested `transact` fails fast instead of taking a second
 * connection.
 */
const InsideTransaction = Context.Reference<boolean>(
  "@watchdog/core/infra/InsideTransaction",
  { defaultValue: () => false }
);

const NESTED_TRANSACT_MESSAGE =
  "transact called inside another transact body: a nested transact opens a second connection and transaction (it can deadlock a small pool). Pass the outer `tx` down instead; see packages/core/AGENTS.md (transact rules).";

/** `mapPostgresCatch` rethrows what it cannot map; that stays a defect. */
function mapDriverFailure(
  driverError: unknown,
  opts: MapPostgresCatchOpts | undefined
): Effect.Effect<never, DomainTag> {
  try {
    return Effect.fail(mapPostgresCatch(driverError, opts));
  } catch (error) {
    return Effect.die(error);
  }
}

/**
 * Run `body` in one transaction on the `Db` service's client (a pool opens a
 * transaction, a `tx` value opens a savepoint). The body sees the caller's services; failures
 * (tagged errors, defects) reach the caller unchanged and roll back; driver
 * errors map as in `tryDb`. Interrupting the caller aborts the body, rolls the
 * transaction back, and only then completes the interruption.
 *
 * Nesting is a programmer error: a `transact` called inside another
 * `transact`'s body (or a fiber it forked) would open a SECOND connection and
 * transaction, commit independently of the outer one and can deadlock a small
 * pool (the outer holds one connection while waiting for another). It dies
 * with a defect BEFORE opening anything; pass the outer `tx` down instead. A
 * caller-provided `Db.layerOf(tx)` is not nesting: that `transact` is the
 * outermost one and opens a savepoint.
 *
 * This is the one promise boundary for transaction bodies: the driver's
 * transaction API is promise-based.
 */
export function transact<A, E extends DomainTag = DomainTag, R = never>(
  body: (tx: DbTx) => Effect.Effect<A, E, R>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.flatMap(Effect.context<R | Db>(), (services) => {
    if (Context.get(services, InsideTransaction)) {
      return Effect.die(new Error(NESTED_TRANSACT_MESSAGE));
    }
    const client = Context.get(services, Db);
    let bodyCause: Cause.Cause<E> | undefined;
    return Effect.callback<A, E | DomainTag>((resume, signal) => {
      const run = Effect.runPromiseExitWith(services);
      const settled = client
        // oxlint-disable-next-line effecttsgo/async-function -- the driver's transaction API is promise-based; this is the one promise boundary for transaction bodies
        .transaction(async (tx) => {
          const exit = await run(
            Effect.provideService(body(tx), InsideTransaction, true),
            {
              signal,
            }
          );
          if (exit._tag === "Failure") {
            if (!Cause.hasFails(exit.cause)) {
              // A defect (e.g. a raw driver error from an inner query) rolls
              // back as itself so `mapPostgresCatch` can still map it below.
              throw Cause.squash(exit.cause);
            }
            bodyCause = exit.cause;
            throw new TxBodyFailureError();
          }
          return exit.value;
        })
        .then(
          (value) => {
            resume(Effect.succeed(value));
          },
          (error: unknown) => {
            // A typed body failure wins over whatever the rejection was: the
            // rollback itself can fail (e.g. a dropped connection) and reject
            // with a driver error instead of `TxBodyFailureError`.
            if (bodyCause !== undefined) {
              resume(Effect.failCause(bodyCause));
              return;
            }
            resume(mapDriverFailure(error, opts));
          }
        );
      // On interruption, wait for the rollback before the caller proceeds.
      return Effect.promise(() => settled);
    });
  });
}
