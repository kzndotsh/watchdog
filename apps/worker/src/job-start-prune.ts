import { Cause, Effect, Schedule } from "effect";

import { pruneJobStartCountersEffect, type Db } from "@watchdog/core/worker";

import { emitOnce, logWorkerError } from "./worker-log";

/** How often the counters of ended Job start windows are deleted (#480). */
const PRUNE_SPACING = "1 hour" as const;

/** One bounded run; a failure is logged and the next run tries again. */
const pruneOnceEffect: Effect.Effect<void, never, Db> = Effect.suspend(() =>
  pruneJobStartCountersEffect()
).pipe(
  Effect.tap(({ removed }) =>
    removed > 0
      ? Effect.sync(() => {
          emitOnce("jobs.start-limits.prune", {
            message: `removed ${removed} ended Job start counter(s)`,
            removed,
          });
        })
      : Effect.void
  ),
  Effect.asVoid,
  Effect.catchCause((cause) =>
    Effect.sync(() => {
      logWorkerError(
        "jobs.start-limits.prune",
        "Job start counter prune failed",
        Cause.squash(cause)
      );
    })
  )
);

/**
 * Delete the counters of ended Job start windows at boot and then hourly (a forked child like the
 * upload sweep). Bounded per run, idempotent, runs as the application role.
 */
export const jobStartPruneLoopEffect: Effect.Effect<void, never, Db> =
  pruneOnceEffect.pipe(
    Effect.repeat(Schedule.spaced(PRUNE_SPACING)),
    Effect.asVoid
  );
