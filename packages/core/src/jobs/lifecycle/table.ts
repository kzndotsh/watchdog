import {
  JOB_STATUSES,
  type JobStatus,
  type JobStopCause,
} from "@watchdog/schemas/shared";

/** What happened to a Job. `fail` and `cancel` carry the cause that is stored with the stop. */
export type JobEvent =
  | { readonly kind: "claim" }
  | { readonly kind: "succeed" }
  | { readonly kind: "fail"; readonly cause: JobStopCause }
  | { readonly kind: "cancel"; readonly cause: JobStopCause };

export type JobEventKind = JobEvent["kind"];

export const JOB_EVENT_KINDS = [
  "claim",
  "succeed",
  "fail",
  "cancel",
] as const satisfies readonly JobEventKind[];

type JobDecision =
  | {
      readonly kind: "move";
      readonly next: JobStatus;
      readonly errorCode: JobStopCause | null;
    }
  | { readonly kind: "none" };

/**
 * The rules: the status each event moves a Job to, or `null` when the event does nothing in
 * that status. The type makes a missing status or event a compile error. A terminal status
 * has no move at all, so nothing can leave it. `claim` from `running` is a reclaim: the Job
 * stays running and a worker takes it over.
 */
const TRANSITIONS: Record<JobStatus, Record<JobEventKind, JobStatus | null>> = {
  queued: {
    claim: "running",
    succeed: null,
    fail: "failed",
    cancel: "cancelled",
  },
  running: {
    claim: "running",
    succeed: "succeeded",
    fail: "failed",
    cancel: "cancelled",
  },
  succeeded: { claim: null, succeed: null, fail: null, cancel: null },
  failed: { claim: null, succeed: null, fail: null, cancel: null },
  cancelled: { claim: null, succeed: null, fail: null, cancel: null },
};

/** What an event does to a Job in its current status. Pure: no clock, no database. */
export function decideJob(
  job: { readonly status: JobStatus },
  event: JobEvent
): JobDecision {
  const next = TRANSITIONS[job.status][event.kind];
  if (next === null) return { kind: "none" };
  const errorCode =
    event.kind === "fail" || event.kind === "cancel" ? event.cause : null;
  return { kind: "move", next, errorCode };
}

/**
 * The statuses an event may start from: the SQL guard (`status = ANY(...)`) of the one write
 * that applies it, derived from the same table as {@link decideJob}, so no writer keeps a
 * status list of its own.
 */
export function allowedFromStatuses(kind: JobEventKind): JobStatus[] {
  return JOB_STATUSES.filter((status) => TRANSITIONS[status][kind] !== null);
}
