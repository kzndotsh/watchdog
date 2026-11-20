import { Context, type Effect } from "effect";

import type { JobLane } from "@watchdog/caps/sdk";

import type { InternalError } from "../errors/tagged-errors";

export type QueueWorkOptions = {
  /** The lane whose queue this handler works. */
  readonly lane: JobLane;
  readonly localConcurrency: number;
  readonly pollingIntervalSeconds: number;
};

/**
 * Why pg-boss gave up on an attempt (#722), read from the abort reason pg-boss gave `signal`:
 * - `claim_lost`: the fenced heartbeat found the delivery no longer active under this worker's
 *   claim (a cancel in the cancel transaction, or another instance failed it);
 * - `expired`: pg-boss's own timer aborted the batch (it aborts with no reason) because the
 *   handler outlived `expireInSeconds`;
 * - `stopping`: the same reasonless abort once a stop has given up on its handlers (a graceful
 *   stop's timeout ran out, or a non-graceful stop). An expiry while a graceful stop still drains
 *   stays `expired`, so the Job records `cap_timeout`.
 */
export type QueueAbort = "claim_lost" | "expired" | "stopping";

/**
 * Map pg-boss's abort reason to a {@link QueueAbort}. pg-boss aborts a batch's controller with no
 * reason (a `DOMException` named `AbortError`) on expiry and when a stop gives up; it aborts one
 * Job's own controller with an `Error` when the heartbeat finds its claim gone.
 */
export function queueAbortOf(reason: unknown, stopGaveUp: boolean): QueueAbort {
  const reasonless =
    reason instanceof DOMException && reason.name === "AbortError";
  if (!reasonless) return "claim_lost";
  return stopGaveUp ? "stopping" : "expired";
}

/** pg-boss's `stop` timeout when none is given. */
const PG_BOSS_STOP_TIMEOUT_MS = 30_000;

/**
 * When a stop begun at `startedAt` stops waiting for running handlers and aborts them: at once
 * for a non-graceful stop, else after its timeout (pg-boss's default when none is given).
 */
export function stopGivesUpAt(
  options:
    | { readonly graceful?: boolean; readonly timeout?: number }
    | undefined,
  startedAt: number
): number {
  if (options?.graceful === false) return startedAt;
  return startedAt + (options?.timeout ?? PG_BOSS_STOP_TIMEOUT_MS);
}

/** One delivered pg-boss job, as the worker handler sees it. */
export type QueuedJob = {
  readonly id: string;
  readonly data: unknown;
  /** The attempt's expiry (pg-boss `expireInSeconds`), used for the timeout message. */
  readonly expireInSeconds: number;
  /**
   * Aborts when pg-boss gives up on the attempt: the handler outlived the expiry,
   * the heartbeat lost the claim (a cancel), or a graceful stop timed out.
   */
  readonly signal: AbortSignal;
  /** Why `signal` aborted; read once it has. */
  readonly abortReason: () => QueueAbort;
};

export type QueueWorkHandler = (jobs: readonly QueuedJob[]) => Promise<void>;

export type JobQueueWorkerApi = {
  /** Register the Cap Job handler. Worker role only: the producer Layer does not provide it. */
  readonly work: (
    options: QueueWorkOptions,
    handler: QueueWorkHandler
  ) => Effect.Effect<void, InternalError>;
};

/** Worker-only operations: absent from the producer Layer, so `R` rejects them there. */
export class JobQueueWorker extends Context.Service<
  JobQueueWorker,
  JobQueueWorkerApi
>()("@watchdog/core/jobs/JobQueueWorker") {}
