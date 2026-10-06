import { Cause, Effect, Schedule } from "effect";

import {
  pruneActivityEffect,
  repairRestoredActivityXidsEffect,
  type Db,
} from "@watchdog/core/worker";

import { emitOnce, logWorkerError } from "./worker-log";

/** How often the activity log is pruned (ADR-0005 decision 8). */
const PRUNE_SPACING = "24 hours" as const;

/**
 * One prune; a failure is logged and the next run tries again. `suspend`: the
 * cutoff is read from the clock on every run, not once at module load.
 */
const pruneOnceEffect: Effect.Effect<void, never, Db> = Effect.suspend(() =>
  pruneActivityEffect()
).pipe(
  Effect.tap(({ pruned, batches }) =>
    pruned > 0
      ? Effect.sync(() => {
          emitOnce("activity.retention", {
            message: `pruned ${pruned} activity entries`,
            pruned,
            batches,
          });
        })
      : Effect.void
  ),
  Effect.asVoid,
  Effect.catchCause((cause) =>
    Effect.sync(() => {
      logWorkerError(
        "activity.retention",
        "activity prune failed",
        Cause.squash(cause)
      );
    })
  )
);

/**
 * Prune the activity log at boot and then daily. The prune raises the replay
 * floor with each batch, so readers behind it resync instead of missing rows
 * (`pruneActivityEffect`). Runs as long as the worker does.
 */
export const activityPruneLoopEffect: Effect.Effect<void, never, Db> =
  pruneOnceEffect.pipe(
    Effect.repeat(Schedule.spaced(PRUNE_SPACING)),
    Effect.asVoid
  );

/**
 * Boot check for a database restored from another cluster: `xid8` values in
 * the future would be held back forever, so they are rewritten before the
 * consumer starts (`repairRestoredActivityXidsEffect`). Logs and continues at
 * the boot edge, like the startup reconcile.
 */
export function repairRestoredActivityXidsAtBootEffect(): Effect.Effect<
  void,
  never,
  Db
> {
  return repairRestoredActivityXidsEffect().pipe(
    Effect.tap(({ repaired }) =>
      repaired > 0
        ? Effect.sync(() => {
            emitOnce("activity.restore", {
              message: `restored database: rewrote ${repaired} activity xid(s) to 0`,
              repaired,
            });
          })
        : Effect.void
    ),
    Effect.asVoid,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logWorkerError(
          "activity.restore",
          "activity xid boot check failed",
          Cause.squash(cause)
        );
      })
    )
  );
}
