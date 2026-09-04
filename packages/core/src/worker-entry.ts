/** Slim worker surface — avoids loading the full @watchdog/core graph barrel. */
export {
  CAP_JOB_QUEUE,
  ensureBossWorkerEffect,
  isCapJobPayload,
  type CapJobPayload,
  type BossRole,
  type BossHandle,
} from "./jobs/boss";
export { gracefulStopTimeoutMs } from "./jobs/timeouts";
export {
  reconcileStaleJobsEffect,
  reconcileStuckPlaybookRunsEffect,
} from "./jobs/reconcile-stale-jobs";
export {
  executeJobOnMap,
  type JobRunOutcome,
  type JobAbortReason,
  type JobRunOutcomeName,
} from "./jobs/run-job";
export { JobFibers, type JobFibersApi } from "./jobs/job-fibers";
export { findCancelledJobIdsEffect } from "./jobs/start-job";
export { isWatchdogEvent, listenForEvents } from "./infra/events";
export { listenForEventsStream } from "./infra/listen-events-stream";
