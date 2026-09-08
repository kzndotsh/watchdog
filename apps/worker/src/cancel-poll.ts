import { Effect, Result, Schedule } from "effect";

import { findCancelledJobIdsEffect, JobFibers } from "@watchdog/core/worker";
import { createLogger } from "@watchdog/log";

/** Dual SoT cancel: product `jobs.status` is polled on this spacing. */
const CANCEL_POLL_SPACING = "2 seconds" as const;

function logCancelPollError(error: unknown): void {
  const log = createLogger({ scope: "worker.cancel_poll" });
  log.set({ message: "cancel poll failed" });
  log.error(error instanceof Error ? error : new Error(String(error)));
  void log.emit();
}

const pollCancelledJobsEffect: Effect.Effect<void, never, JobFibers> =
  Effect.gen(function* pollCancelledJobsGen() {
    const fibers = yield* JobFibers;
    const runningBefore = fibers.listIds();
    if (runningBefore.length === 0) {
      return;
    }
    const outcome = yield* Effect.result(
      findCancelledJobIdsEffect([...runningBefore])
    );
    if (Result.isFailure(outcome)) {
      logCancelPollError(outcome.failure);
      return;
    }
    const cancelled = new Set(outcome.success);
    const runningBeforeSet = new Set(runningBefore);
    const runningAfter = fibers.listIds();
    const newlyRunning = runningAfter.filter((id) => !runningBeforeSet.has(id));
    if (newlyRunning.length > 0) {
      const followUp = yield* Effect.result(
        findCancelledJobIdsEffect([...runningBefore, ...newlyRunning])
      );
      if (Result.isFailure(followUp)) {
        logCancelPollError(followUp.failure);
      } else {
        for (const id of followUp.success) {
          cancelled.add(id);
        }
      }
    }
    for (const id of cancelled) {
      yield* fibers.abort(id, "cancel");
    }
  });

export const cancelPollLoopEffect: Effect.Effect<void, never, JobFibers> =
  pollCancelledJobsEffect.pipe(
    Effect.repeat(Schedule.spaced(CANCEL_POLL_SPACING)),
    Effect.asVoid
  );
