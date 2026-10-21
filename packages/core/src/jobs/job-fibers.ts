import { Context, Effect, Fiber, FiberMap, Layer, Option, Ref } from "effect";

import {
  makeStopSlot,
  type JobStop,
  type StopSlot,
} from "./lifecycle/stop-slot";
import type { JobRunOutcome } from "./run-outcome";

/**
 * What one attempt at a Job shares with the rest of the worker: the stop slot the abort
 * sources write, and the outcome the settle publishes. An interrupted fiber cannot return a
 * value, so `executeJobOnMap` reads the outcome of an interrupted attempt from here.
 */
export type JobAttempt = {
  readonly stop: StopSlot;
  readonly settled: Ref.Ref<JobRunOutcome | null>;
};

export type JobFibersApi = {
  readonly map: FiberMap.FiberMap<string>;
  /**
   * Offers `stop` to the Job's stop slot (first offer wins), then interrupts the Job fiber
   * (Effect, not runFork). False when no fiber runs the Job.
   */
  readonly abort: (jobId: string, stop: JobStop) => Effect.Effect<boolean>;
  readonly listIds: () => readonly string[];
  /** The Job's current attempt, created by the first abort or by `run`. */
  readonly attemptFor: (jobId: string) => JobAttempt;
  /** Drop the attempt once its fiber has ended, so the next attempt starts empty. */
  readonly clearAttempt: (jobId: string) => void;
};

export class JobFibers extends Context.Service<JobFibers, JobFibersApi>()(
  "@watchdog/core/jobs/JobFibers"
) {
  static readonly layer = Layer.effect(
    JobFibers,
    Effect.gen(function* makeJobFibers() {
      const map = yield* FiberMap.make<string>();
      const attempts = new Map<string, JobAttempt>();
      const attemptFor = (jobId: string): JobAttempt => {
        const existing = attempts.get(jobId);
        if (existing !== undefined) return existing;
        const attempt: JobAttempt = {
          stop: makeStopSlot(),
          settled: Ref.makeUnsafe<JobRunOutcome | null>(null),
        };
        attempts.set(jobId, attempt);
        return attempt;
      };
      return JobFibers.of({
        map,
        abort: (jobId, stop) =>
          Effect.gen(function* abortJobFiberGen() {
            const fiber = FiberMap.getUnsafe(map, jobId);
            if (Option.isNone(fiber)) return false;
            yield* attemptFor(jobId).stop.offer(stop);
            yield* Fiber.interrupt(Option.getOrThrow(fiber));
            return true;
          }),
        listIds: () => [...map].map(([jobId]) => jobId),
        attemptFor,
        clearAttempt: (jobId) => {
          attempts.delete(jobId);
        },
      });
    })
  );
}
