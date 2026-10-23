import { Effect } from "effect";

import { requireCapability } from "@watchdog/caps";
import { capLane, JOB_LANES, type JobLane } from "@watchdog/caps/sdk";
import { env } from "@watchdog/env/server";

import type { InternalError } from "../infra/tagged-errors";
import { JobQueueWorker, type QueueWorkHandler } from "./job-queue-worker";
import { isSystemJobId, SYSTEM_JOB_LANE } from "./system-jobs";

/**
 * The pg-boss queue of a lane. `quick` keeps the name every delivery had before lanes
 * existed (`watchdog.cap-jobs`), so a Job queued by an older release still has a worker.
 */
export function laneQueueName(lane: JobLane): string {
  return lane === "quick" ? "watchdog.cap-jobs" : `watchdog.cap-jobs.${lane}`;
}

/** The lane a Job runs in: its Cap's (`capLane`), or heavy for a system Job. */
export function jobLane(capabilityId: string): JobLane {
  return isSystemJobId(capabilityId)
    ? SYSTEM_JOB_LANE
    : capLane(requireCapability(capabilityId));
}

/** How many Jobs a lane runs at once in one worker process (`WD_WORKER_*_CONCURRENCY`). */
export function laneConcurrency(lane: JobLane): number {
  switch (lane) {
    case "quick": {
      return env.WD_WORKER_QUICK_CONCURRENCY;
    }
    case "heavy": {
      return env.WD_WORKER_HEAVY_CONCURRENCY;
    }
    case "act": {
      return env.WD_WORKER_ACT_CONCURRENCY;
    }
    default: {
      lane satisfies never;
      return 1;
    }
  }
}

/** `quick x4, heavy x2, act x2`: the lanes and their slots, for the worker's boot line. */
export function laneSummary(): string {
  return JOB_LANES.map((lane) => `${lane} x${laneConcurrency(lane)}`).join(
    ", "
  );
}

/**
 * Register one handler on every lane with that lane's concurrency. A lane is its own
 * queue and its own set of slots, so a Job that holds a heavy slot for an hour never
 * delays a quick lookup.
 */
export function workLanesEffect(
  handler: QueueWorkHandler,
  opts: {
    readonly pollingIntervalSeconds: number;
    readonly concurrency?: (lane: JobLane) => number;
  }
): Effect.Effect<void, InternalError, JobQueueWorker> {
  return Effect.gen(function* workLanesGen() {
    const worker = yield* JobQueueWorker;
    const concurrency = opts.concurrency ?? laneConcurrency;
    yield* Effect.forEach(
      JOB_LANES,
      (lane) =>
        worker.work(
          {
            lane,
            localConcurrency: concurrency(lane),
            pollingIntervalSeconds: opts.pollingIntervalSeconds,
          },
          handler
        ),
      { discard: true }
    );
  });
}
