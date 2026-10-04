import { Cause, Effect } from "effect";

import { db, type DbTx } from "@watchdog/db";

import { mapPostgresCatch, type MapPostgresCatchOpts } from "./postgres-effect";
import type { DomainTag } from "./tagged-errors";

/**
 * Rejection thrown from the driver's promise-based `db.transaction` callback
 * so the transaction rolls back. The typed `Cause` travels separately in a
 * closure variable, so the failure is never flattened to `Error`
 * and stays distinguishable from genuine driver errors.
 */
class TxBodyFailureError extends Error {
  override readonly name = "TxBodyFailureError";
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
 * Run `body` in one transaction. The body sees the caller's services; failures
 * (tagged errors, defects) reach the caller unchanged and roll back; driver
 * errors map as in `tryDb`. Interrupting the caller aborts the body, rolls the
 * transaction back, and only then completes the interruption.
 *
 * This is the one promise boundary for transaction bodies: the driver's
 * transaction API is promise-based.
 */
export function transact<A, E extends DomainTag = DomainTag, R = never>(
  body: (tx: DbTx) => Effect.Effect<A, E, R>,
  opts?: MapPostgresCatchOpts
): Effect.Effect<A, E | DomainTag, R> {
  return Effect.flatMap(Effect.context<R>(), (services) => {
    let bodyCause: Cause.Cause<E> | undefined;
    return Effect.callback<A, E | DomainTag>((resume, signal) => {
      const run = Effect.runPromiseExitWith(services);
      const settled = db
        .transaction(async (tx) => {
          const exit = await run(body(tx), { signal });
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
            if (
              error instanceof TxBodyFailureError &&
              bodyCause !== undefined
            ) {
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
