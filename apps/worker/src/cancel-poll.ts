import { Effect, Result, Schedule } from "effect";

import { findCancelledJobIdsEffect, JobFibers } from "@watchdog/core/worker";
import { createLogger } from "@watchdog/log";

/** Dual SoT cancel: product `jobs.status` is polled on this spacing. */
export const CANCEL_POLL_SPACING = "2 seconds" as const;

function logCancelPollError(error: unknown): void {
  const log = createLogger({ scope: "worker.cancel_poll" });
  log.set({ message: "cancel poll failed" });
  log.error(error instanceof Error ? error : new Error(String(error)));
  void log.emit();
}

export const pollCancelledJobsEffect: Effect.Effect<void, never, JobFibers> =
  Effect.gen(function* pollCancelledJobsGen() {
    const fibers = yield* JobFibers;
    const running = fibers.listIds();
    if (running.length === 0) {
      return;
    }
    const outcome = yield* Effect.result(
      findCancelledJobIdsEffect([...running])
    );
    if (Result.isFailure(outcome)) {
      logCancelPollError(outcome.failure);
      return;
    }
    for (const id of outcome.success) {
      yield* fibers.abort(id, "cancel");
    }
  });

export const cancelPollLoopEffect: Effect.Effect<void, never, JobFibers> =
  pollCancelledJobsEffect.pipe(
    Effect.repeat(Schedule.spaced(CANCEL_POLL_SPACING)),
    Effect.asVoid
  );
