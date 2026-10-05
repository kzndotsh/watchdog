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
 * True while a `transact` body runs, for that body and every fiber it forks
 * (the reference is inherited at fork time). `transact` sets it around the
 * body and checks it before opening a transaction, so a nested `transact`
 * fails fast instead of taking a second connection. A fiber that outlives the
 * body resets it with `outsideTransaction`.
 */
const InsideTransaction = Context.Reference<boolean>(
  "@watchdog/core/infra/InsideTransaction",
  { defaultValue: () => false }
);

const NESTED_TRANSACT_MESSAGE =
  "transact called inside another transact body: a nested transact opens a second connection and transaction (it can deadlock a small pool). Pass the outer `tx` down instead; see packages/core/AGENTS.md (transact rules).";

/**
 * Run `effect` as outside any `transact` body. Use it at the root of a
 * DETACHED fiber (`forkDetach`) forked from inside a body: that fiber inherits
 * the nesting flag but outlives the transaction and never touches the outer
 * connection, so a `transact` of its own is the outermost one, not nesting.
 * Do not use it to dodge the guard for a child the body awaits (see
 * `transact`).
 */
export function outsideTransaction<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  return Effect.provideService(effect, InsideTransaction, false);
}

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
 * transaction; a provided `Db.layerOf(tx)` opens a savepoint, but only
 * OUTSIDE another `transact` body). The body sees the caller's services; failures
 * (tagged errors, defects) reach the caller unchanged and roll back; driver
 * errors map as in `tryDb`. Interrupting the caller aborts the body, rolls the
 * transaction back, and only then completes the interruption.
 *
 * Nesting is a programmer error: a `transact` called inside another
 * `transact`'s body (or a fiber it forked) would open a SECOND connection and
 * transaction, commit independently of the outer one and can deadlock a small
 * pool (the outer holds one connection while waiting for another). It dies
 * with a defect BEFORE opening anything; pass the outer `tx` down instead.
 * This includes a forked child the body AWAITS (it holds a second connection
 * while the parent waits) and `Effect.provide(transact(...), Db.layerOf(tx))`
 * inside a body. Outside any body, a caller-provided `Db.layerOf(tx)` is not
 * nesting: that `transact` is the outermost one and opens a savepoint. A
 * DETACHED fiber (`forkDetach`) forked inside a body runs outside the
 * transaction (it resets the flag with `outsideTransaction`) and may run its
 * own `transact`.
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
