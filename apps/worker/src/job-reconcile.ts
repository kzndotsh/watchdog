import { Cause, Effect } from "effect";

import {
  JOB_RECONCILE_INTERVAL,
  reconcileJobsEffect,
  type Db,
  type JobQueue,
} from "@watchdog/core/worker";

import { emitOnce, logWorkerError } from "./worker-log";

/**
 * One reconcile tick (core's `reconcileJobsEffect`: stale Jobs, the Case access recheck,
 * stuck playbook runs, orphaned queued Jobs, under an advisory lock). A failure is logged and
 * the next tick tries again; a tick another worker holds the lock for does nothing.
 */
export const reconcileJobsOnceEffect: Effect.Effect<
  void,
  never,
  Db | JobQueue
> = Effect.suspend(() => reconcileJobsEffect()).pipe(
  Effect.tap((result) => {
    const { ran, stale, accessRevoked, stuckPlaybooks, orphanedQueued } =
      result;
    if (!ran) return Effect.void;
    const changed = stale + accessRevoked + stuckPlaybooks + orphanedQueued;
    return changed === 0
      ? Effect.void
      : Effect.sync(() => {
          emitOnce("worker.reconcile", {
            message: `reconciled Jobs: ${stale} stale, ${accessRevoked} access revoked, ${stuckPlaybooks} stuck playbook run(s), ${orphanedQueued} orphaned queued re-enqueued`,
            stale,
            accessRevoked,
            stuckPlaybooks,
            orphanedQueued,
          });
        });
  }),
  Effect.asVoid,
  Effect.catchCause((cause) =>
    Effect.sync(() => {
      logWorkerError(
        "worker.reconcile",
        "job reconcile failed",
        Cause.squash(cause)
      );
    })
  )
);

/**
 * The repeating tick: waits one spacing, then runs, forever. Boot runs the first tick itself
 * (before the queue handler registers) and forks this for the rest. `spacing` is a parameter
 * so a test can shorten it.
 */
export function jobReconcileLoopEffect(
  spacing:
    | typeof JOB_RECONCILE_INTERVAL
    | `${number} millis` = JOB_RECONCILE_INTERVAL
): Effect.Effect<never, never, Db | JobQueue> {
  return reconcileJobsOnceEffect.pipe(Effect.delay(spacing), Effect.forever);
}
