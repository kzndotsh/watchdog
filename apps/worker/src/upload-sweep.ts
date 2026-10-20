import { Cause, Effect, Schedule } from "effect";

import {
  sweepAbandonedUploadsEffect,
  type BlobStore,
  type Db,
} from "@watchdog/core/worker";

import { emitOnce, logWorkerError } from "./worker-log";

/** How often abandoned presigned uploads are swept (#305). */
const SWEEP_SPACING = "1 hour" as const;

/**
 * One sweep run; a failure is logged and the next run tries again (a failed object delete rolls
 * back, so the records stay and are retried).
 */
const sweepOnceEffect: Effect.Effect<void, never, Db | BlobStore> =
  Effect.suspend(() => sweepAbandonedUploadsEffect()).pipe(
    Effect.tap(({ swept }) =>
      swept > 0
        ? Effect.sync(() => {
            emitOnce("evidence.upload-sweep.run", {
              message: `removed ${swept} abandoned upload(s)`,
              swept,
            });
          })
        : Effect.void
    ),
    Effect.asVoid,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logWorkerError(
          "evidence.upload-sweep.run",
          "upload sweep run failed",
          Cause.squash(cause)
        );
      })
    )
  );

/**
 * Delete the objects of presigned uploads never confirmed within the grace window, at boot and
 * then hourly (a forked child like the case purge). Bounded per run, idempotent, and safe beside
 * a second worker (`SKIP LOCKED`). Runs as the application role: the table is not audit.
 */
export const uploadSweepLoopEffect: Effect.Effect<void, never, Db | BlobStore> =
  sweepOnceEffect.pipe(
    Effect.repeat(Schedule.spaced(SWEEP_SPACING)),
    Effect.asVoid
  );
