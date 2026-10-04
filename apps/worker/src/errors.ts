import { Data } from "effect";

/** The LISTEN connection failed; fails the boot so the worker exits non-zero after draining. */
export class WorkerListenError extends Data.TaggedError("WorkerListenError")<{
  readonly cause: unknown;
}> {
  readonly code = "worker_listen" as const;
}
