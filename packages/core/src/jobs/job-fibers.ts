import { Context, Effect, Fiber, FiberMap, Layer, Option } from "effect";

export type JobAbortReason = "timeout" | "cancel";

export interface JobFibersApi {
  readonly map: FiberMap.FiberMap<string>;
  /** Sets abort reason then interrupts the Job fiber (Effect, not runFork). */
  readonly abort: (
    jobId: string,
    reason: JobAbortReason
  ) => Effect.Effect<boolean>;
  readonly listIds: () => readonly string[];
  readonly peekReason: (jobId: string) => JobAbortReason | undefined;
  readonly setReason: (jobId: string, reason: JobAbortReason) => void;
  readonly clearReason: (jobId: string) => void;
}

export class JobFibers extends Context.Service<JobFibers, JobFibersApi>()(
  "@watchdog/core/jobs/JobFibers"
) {
  static readonly layer = Layer.effect(
    JobFibers,
    Effect.gen(function* makeJobFibers() {
      const map = yield* FiberMap.make<string>();
      const abortReasons = new Map<string, JobAbortReason>();
      return JobFibers.of({
        map,
        abort: (jobId, reason) =>
          Effect.gen(function* abortJobFiberGen() {
            const fiber = FiberMap.getUnsafe(map, jobId);
            if (Option.isNone(fiber)) return false;
            abortReasons.set(jobId, reason);
            yield* Fiber.interrupt(Option.getOrThrow(fiber));
            return true;
          }),
        listIds: () => [...map].map(([jobId]) => jobId),
        peekReason: (jobId) => abortReasons.get(jobId),
        setReason: (jobId, reason) => {
          abortReasons.set(jobId, reason);
        },
        clearReason: (jobId) => {
          abortReasons.delete(jobId);
        },
      });
    })
  );
}
