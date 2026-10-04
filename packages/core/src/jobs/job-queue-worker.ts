import { Context, type Effect } from "effect";

import type { InternalError } from "../infra/tagged-errors";

export interface QueueWorkOptions {
  readonly localConcurrency: number;
  readonly pollingIntervalSeconds: number;
}

/** One delivered pg-boss job, as the worker handler sees it. */
export interface QueuedJob {
  readonly id: string;
  readonly data: unknown;
}

export type QueueWorkHandler = (jobs: readonly QueuedJob[]) => Promise<void>;

export interface JobQueueWorkerApi {
  /** Register the Cap Job handler. Worker role only: the producer Layer does not provide it. */
  readonly work: (
    options: QueueWorkOptions,
    handler: QueueWorkHandler
  ) => Effect.Effect<void, InternalError>;
}

/** Worker-only operations: absent from the producer Layer, so `R` rejects them there. */
export class JobQueueWorker extends Context.Service<
  JobQueueWorker,
  JobQueueWorkerApi
>()("@watchdog/core/jobs/JobQueueWorker") {}
