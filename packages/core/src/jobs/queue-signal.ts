import { Effect, Fiber } from "effect";

import type { JobStopCause } from "@watchdog/domain/schemas/shared";

import type { JobFibers } from "./job-fibers";
import type { QueueAbort, QueuedJob } from "./job-queue-worker";
import { stop } from "./lifecycle/stop";
import { timedOutMessage } from "./lifecycle/stop-slot";

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

/** The stop cause a pg-boss abort offers the attempt, by its {@link QueueAbort}. */
const STOP_CAUSE = {
  expired: "cap_timeout",
  stopping: "worker_shutdown",
  claim_lost: "queue_aborted",
} as const satisfies Record<QueueAbort, JobStopCause>;

/**
 * Run a delivered Cap Job and tie it to its pg-boss `signal` (#397, #722). pg-boss aborts the
 * signal when the handler outlives the job's `expireInSeconds` (it fails the delivery and holds
 * the worker slot until the handler returns), when its fenced heartbeat finds the claim gone (a
 * cancel cancelled the delivery in the cancel transaction, or another instance failed it), and
 * when a graceful stop gives up. The abort reason pg-boss gave (`job.abortReason()`) picks the
 * stop offered to the attempt's stop slot: `cap_timeout` (`Timed out after <expiry>`) for an
 * expiry, `worker_shutdown` for a stop, `queue_aborted` for a lost claim. A cancelled Job is
 * already `cancelled`, so its release settles nothing and the canceller advances the run. Then
 * the Job fiber is interrupted and the handler returns. `jobs.status` stays the product source
 * of truth.
 */
export function interruptOnQueueSignal<A, E, R>(
  job: Pick<QueuedJob, "signal" | "expireInSeconds" | "abortReason">,
  jobId: string,
  run: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | JobFibers> {
  return Effect.gen(function* interruptOnQueueSignalGen() {
    const watcher = yield* Effect.forkChild(
      Effect.gen(function* watchQueueSignalGen() {
        yield* whenAborted(job.signal);
        const abort = job.abortReason();
        // Only an expiry names its window: the text the Job's `error` shows.
        const detail =
          abort === "expired"
            ? timedOutMessage(job.expireInSeconds * 1000)
            : undefined;
        yield* stop({ kind: "job", jobId }, STOP_CAUSE[abort], detail);
      })
    );
    return yield* run.pipe(Effect.ensuring(Fiber.interrupt(watcher)));
  });
}
