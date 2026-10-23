import { Data } from "effect";

/** The worker's configuration cannot run: the boot fails with the reason, naming the settings. */
export class WorkerConfigError extends Data.TaggedError("WorkerConfigError")<{
  readonly reason: string;
}> {
  readonly code = "worker_config" as const;
}
