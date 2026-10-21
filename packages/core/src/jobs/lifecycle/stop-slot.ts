import type { Effect } from "effect";
import { Ref } from "effect";

import type { JobStopCause } from "@watchdog/schemas/shared";

import type { JobEvent } from "./table";

/** Why an attempt was stopped: the closed cause stored in `error_code`, and the text for `error`. */
export type JobStop = {
  readonly cause: JobStopCause;
  readonly detail?: string;
};

/**
 * The stop slot of one attempt at a Job. Every source that can end the attempt (the Cap timer,
 * the pg-boss signal, the cancel poll) offers its stop here; the first offer wins and the rest
 * are ignored, so the settle records the source that really stopped the Job.
 */
export type StopSlot = {
  /** True when this stop is the one the slot kept. */
  readonly offer: (stop: JobStop) => Effect.Effect<boolean>;
  readonly peek: Effect.Effect<JobStop | null>;
};

export function makeStopSlot(): StopSlot {
  const ref = Ref.makeUnsafe<JobStop | null>(null);
  return {
    offer: (stop) =>
      Ref.modify(ref, (current): readonly [boolean, JobStop | null] =>
        current === null ? [true, stop] : [false, current]
      ),
    peek: Ref.get(ref),
  };
}

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

/** The `error` a stopped Job gets: the detail the source gave, else a text for the cause. */
export function stopMessage(stop: JobStop): string {
  if (stop.detail !== undefined) return stop.detail;
  return stop.cause === "cap_timeout" ? "Timed out" : "aborted";
}

/** The causes of a cancel: a person (or a lost Case or access) ended the Job. */
export const CANCEL_CAUSES = [
  "user_cancelled",
  "case_deleted",
  "access_revoked",
] as const satisfies readonly JobStopCause[];

export type CancelCause = (typeof CANCEL_CAUSES)[number];

const CANCELLING_CAUSES: ReadonlySet<JobStopCause> = new Set(CANCEL_CAUSES);

/** A person (or a lost Case or access) ended it: `cancel`. Anything else is a failure. */
export function stopEvent(cause: JobStopCause): JobEvent {
  return CANCELLING_CAUSES.has(cause)
    ? { kind: "cancel", cause }
    : { kind: "fail", cause };
}
