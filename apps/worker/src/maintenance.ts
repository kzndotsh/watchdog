import { Cause, Effect } from "effect";

import {
  MAINTENANCE_TASKS,
  type MaintenanceCheck,
  type MaintenanceServices,
  type MaintenanceTask,
} from "@watchdog/core/maintenance";

import { emitOnce, logWorkerError } from "./worker-log";

/**
 * One run of a check: its report is logged under the check's name, a failure is
 * logged as its `failureMessage`, and nothing escapes (a defect included), so a
 * failed run never ends the loop or the boot step that called it.
 */
export function runMaintenanceOnceEffect(
  check: MaintenanceCheck
): Effect.Effect<void, never, MaintenanceServices> {
  return check.run.pipe(
    Effect.tap((report) =>
      report === undefined
        ? Effect.void
        : Effect.sync(() => {
            emitOnce(check.name, report);
          })
    ),
    Effect.asVoid,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logWorkerError(check.name, check.failureMessage, Cause.squash(cause));
      })
    )
  );
}

/**
 * Repeat a task for as long as the worker runs: first run at once (after one
 * spacing for `delayFirst`), then one spacing after each run ends.
 */
export function maintenanceLoopEffect(
  task: MaintenanceTask
): Effect.Effect<never, never, MaintenanceServices> {
  const once = runMaintenanceOnceEffect(task);
  return task.delayFirst
    ? once.pipe(Effect.delay(task.every), Effect.forever)
    : once.pipe(Effect.andThen(Effect.sleep(task.every)), Effect.forever);
}

/** Fork one loop per task (core's `MAINTENANCE_TASKS` unless a test passes its own). */
export function forkMaintenanceEffect(
  tasks: readonly MaintenanceTask[] = MAINTENANCE_TASKS
): Effect.Effect<void, never, MaintenanceServices> {
  return Effect.forEach(
    tasks,
    (task) => Effect.forkChild(maintenanceLoopEffect(task)),
    { discard: true }
  );
}
