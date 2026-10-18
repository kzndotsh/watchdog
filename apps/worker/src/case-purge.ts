import { Cause, Effect, Schedule } from "effect";

import {
  purgeExpiredCasesEffect,
  type BlobStore,
  type Db,
} from "@watchdog/core/worker";

import { emitOnce, logWorkerError } from "./worker-log";

/** How often deleted Cases past their restore window are purged (#304). */
const PURGE_SPACING = "1 hour" as const;

/**
 * One purge run; a failure is logged and the next run tries again. `suspend`: the cutoff is read
 * from the clock and the configured window on every run, not once at module load. A Case whose
 * files could not be erased stays deleted with its error recorded, and the next run retries it.
 */
const purgeOnceEffect: Effect.Effect<void, never, Db | BlobStore> =
  Effect.suspend(() => purgeExpiredCasesEffect()).pipe(
    Effect.tap(({ purged, failed }) =>
      purged > 0 || failed > 0
        ? Effect.sync(() => {
            emitOnce("case.purge.run", {
              message: `purged ${purged} deleted Case(s), ${failed} failed and will be retried`,
              purged,
              failed,
            });
          })
        : Effect.void
    ),
    Effect.asVoid,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logWorkerError(
          "case.purge.run",
          "case purge run failed",
          Cause.squash(cause)
        );
      })
    )
  );

/**
 * Purge deleted Cases past the restore window at boot and then hourly: the Case, its Graph and
 * history, Evidence and files go; the permanent deletion record stays. Runs as the application
 * role (the foreign-key cascade deletes the audit rows as the table owner), so the worker needs
 * no owner credentials. Safe beside a second worker or a Purge now: each Case is locked with
 * `SKIP LOCKED` and purged by exactly one.
 */
export const casePurgeLoopEffect: Effect.Effect<void, never, Db | BlobStore> =
  purgeOnceEffect.pipe(
    Effect.repeat(Schedule.spaced(PURGE_SPACING)),
    Effect.asVoid
  );
