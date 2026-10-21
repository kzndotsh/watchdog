import { Effect, Fiber } from "effect";

import { nowMillisEffect } from "../infra/clock";
import type { JobFibers } from "./job-fibers";
import type { QueuedJob } from "./job-queue-worker";
import { stop } from "./lifecycle/stop";
import { timedOutMessage } from "./lifecycle/stop-slot";

/**
 * Slack for the clock difference between pg-boss's timer (which aborts the
 * signal when the handler outlives `expireInSeconds`) and ours.
 */
const EXPIRY_TOLERANCE_MS = 100;

/** Completes when the signal aborts (at once if it already has). */
function whenAborted(signal: AbortSignal): Effect.Effect<AbortSignal> {
  return Effect.callback<AbortSignal>((resume) => {
    if (signal.aborted) {
      resume(Effect.succeed(signal));
      return;
    }
    const onAbort = () => {
      resume(Effect.succeed(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    return Effect.sync(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * Run a delivered Cap Job and tie it to its pg-boss `signal` (#397). pg-boss
 * aborts the signal when the handler outlives the job's `expireInSeconds` (it
 * fails the delivery and holds the worker slot until the handler returns), when
 * a heartbeat finds the claim gone, and when a graceful stop gives up. Each
 * abort goes through `stop`, the same path as a cancel: the cause is
 * offered to the attempt's stop slot (an expiry is `cap_timeout`, anything else
 * `queue_aborted`), then the Job fiber is interrupted, so the lifecycle `run` marks the Job
 * `failed` (`Timed out after <expiry>` for an expiry, `aborted` otherwise) and the
 * handler returns. `jobs.status` stays the product source of truth.
 */
export function interruptOnQueueSignal<A, E, R>(
  job: Pick<QueuedJob, "signal" | "expireInSeconds">,
  jobId: string,
  run: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | JobFibers> {
  return Effect.gen(function* interruptOnQueueSignalGen() {
    const startedAt = yield* nowMillisEffect;
    const expiryMs = job.expireInSeconds * 1000;
    const watcher = yield* Effect.forkChild(
      Effect.gen(function* watchQueueSignalGen() {
        yield* whenAborted(job.signal);
        const elapsed = (yield* nowMillisEffect) - startedAt;
        const expired = elapsed + EXPIRY_TOLERANCE_MS >= expiryMs;
        const target = { kind: "job", jobId } as const;
        yield* expired
          ? stop(target, "cap_timeout", timedOutMessage(expiryMs))
          : stop(target, "queue_aborted");
      })
    );
    return yield* run.pipe(Effect.ensuring(Fiber.interrupt(watcher)));
  });
}
