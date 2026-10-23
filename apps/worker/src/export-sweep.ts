import { Cause, Effect, Schedule } from "effect";

import {
  sweepExpiredCaseExportsEffect,
  type BlobStore,
} from "@watchdog/core/worker";

import { emitOnce, logWorkerError } from "./worker-log";

/** How often expired Case export archives are deleted (#476). */
const SWEEP_SPACING = "1 hour" as const;

/** One sweep run; a failure is logged and the next run tries again (a delete is idempotent). */
const sweepOnceEffect: Effect.Effect<void, never, BlobStore> = Effect.suspend(
  () => sweepExpiredCaseExportsEffect()
).pipe(
  Effect.tap((swept) =>
    swept > 0
      ? Effect.sync(() => {
          emitOnce("export.sweep.run", {
            message: `removed ${swept} expired export archive(s)`,
            swept,
          });
        })
      : Effect.void
  ),
  Effect.asVoid,
  Effect.catchCause((cause) =>
    Effect.sync(() => {
      logWorkerError(
        "export.sweep.run",
        "export archive sweep run failed",
        Cause.squash(cause)
      );
    })
  )
);

/**
 * Delete the stored archives of large Case exports once their download link has expired
 * (`WD_EXPORT_LINK_TTL_HOURS`), at boot and then hourly (a forked child like the upload sweep).
 * It reads each object's own age, so it needs no database and is safe beside a second worker.
 */
export const exportSweepLoopEffect: Effect.Effect<void, never, BlobStore> =
  sweepOnceEffect.pipe(
    Effect.repeat(Schedule.spaced(SWEEP_SPACING)),
    Effect.asVoid
  );
