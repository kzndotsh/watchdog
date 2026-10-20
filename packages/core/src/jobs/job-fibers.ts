import { Context, Effect, Fiber, FiberMap, Layer, Option } from "effect";

export type JobAbortReason = "timeout" | "cancel";

function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** The `error` a Job gets when it overran: `Timed out after 90s`. */
export function timedOutMessage(afterMs: number): string {
  return `Timed out after ${formatDuration(afterMs)}`;
}

/** The `error` a Job gets when an abort interrupted it (`detail` is the timeout text). */
export function abortFailureMessage(
  reason: JobAbortReason,
  detail: string | undefined
): string {
  if (reason === "timeout") return detail ?? "Timed out";
  return "aborted";
}

export type JobFibersApi = {
  readonly map: FiberMap.FiberMap<string>;
  /**
   * Sets abort reason (and the timeout text, `detail`) then interrupts the Job
   * fiber (Effect, not runFork).
   */
  readonly abort: (
    jobId: string,
    reason: JobAbortReason,
    detail?: string
  ) => Effect.Effect<boolean>;
  readonly listIds: () => readonly string[];
  readonly peekReason: (jobId: string) => JobAbortReason | undefined;
  /** The timeout text stored with the reason, if any. */
  readonly peekDetail: (jobId: string) => string | undefined;
  readonly setReason: (
    jobId: string,
    reason: JobAbortReason,
    detail?: string
  ) => void;
  readonly clearReason: (jobId: string) => void;
};

export class JobFibers extends Context.Service<JobFibers, JobFibersApi>()(
  "@watchdog/core/jobs/JobFibers"
) {
  static readonly layer = Layer.effect(
    JobFibers,
    Effect.gen(function* makeJobFibers() {
      const map = yield* FiberMap.make<string>();
      const abortReasons = new Map<string, JobAbortReason>();
      const abortDetails = new Map<string, string>();
      const store = (
        jobId: string,
        reason: JobAbortReason,
        detail: string | undefined
      ) => {
        // First writer wins: aborts race (queue expiry, cancel poll, Cap timer).
        if (abortReasons.has(jobId)) return;
        abortReasons.set(jobId, reason);
        if (detail !== undefined) abortDetails.set(jobId, detail);
      };
      return JobFibers.of({
        map,
        abort: (jobId, reason, detail) =>
          Effect.gen(function* abortJobFiberGen() {
            const fiber = FiberMap.getUnsafe(map, jobId);
            if (Option.isNone(fiber)) return false;
            store(jobId, reason, detail);
            yield* Fiber.interrupt(Option.getOrThrow(fiber));
            return true;
          }),
        listIds: () => [...map].map(([jobId]) => jobId),
        peekReason: (jobId) => abortReasons.get(jobId),
        peekDetail: (jobId) => abortDetails.get(jobId),
        setReason: (jobId, reason, detail) => {
          store(jobId, reason, detail);
        },
        clearReason: (jobId) => {
          abortReasons.delete(jobId);
          abortDetails.delete(jobId);
        },
      });
    })
  );
}
