import { Context, type Effect } from "effect";

import type { InternalError } from "../infra/tagged-errors";

export type QueueWorkOptions = {
  readonly localConcurrency: number;
  readonly pollingIntervalSeconds: number;
};

/** One delivered pg-boss job, as the worker handler sees it. */
export type QueuedJob = {
  readonly id: string;
  readonly data: unknown;
  /** The attempt's expiry (pg-boss `expireInSeconds`), after which `signal` aborts. */
  readonly expireInSeconds: number;
  /**
   * Aborts when pg-boss gives up on the attempt: the handler outlived the expiry,
   * the heartbeat lost the claim, or a graceful stop timed out.
   */
  readonly signal: AbortSignal;
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
