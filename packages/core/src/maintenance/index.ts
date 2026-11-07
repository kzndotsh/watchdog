import { Effect, type Duration } from "effect";

import { repairRestoredActivityXidsEffect } from "../activity/restore-check";
import { pruneActivityEffect } from "../activity/retention";
import { purgeExpiredCasesEffect } from "../case-deletion/purge";
import { sweepAbandonedUploadsEffect } from "../evidence/upload-sweep";
import { sweepExpiredCaseExportsEffect } from "../export/export-objects";
import type { BlobStore } from "../infra/blob-store";
import type { Db } from "../infra/db-service";
import type { JobQueue } from "../jobs/job-queue";
import {
  JOB_RECONCILE_INTERVAL,
  reconcileJobsEffect,
} from "../jobs/lifecycle/reconcile";
import { pruneJobStartCountersEffect } from "../jobs/start-limits-prune";
import {
  activityPruneReport,
  activityRestoreReport,
  casePurgeReport,
  exportSweepReport,
  jobStartPruneReport,
  reconcileReport,
  uploadSweepReport,
  type MaintenanceReport,
} from "./reports";

export type { MaintenanceReport } from "./reports";

/** The services a maintenance run may need; the worker provides all of them. */
export type MaintenanceServices = Db | BlobStore | JobQueue;

/**
 * One run of a maintenance job. `run` succeeds with a report to log, or with
 * `undefined` when there was nothing to say; a failure (typed or defect) is the
 * runner's to log as `failureMessage`, under the scope `name`, and never ends
 * the loop. Each run re-evaluates `run` (`Effect.suspend`), so a cutoff is read
 * from the clock on every run, not once at module load.
 */
export type MaintenanceCheck = {
  /** The wide-event scope for the report and for a failure. */
  readonly name: string;
  readonly failureMessage: string;
  readonly run: Effect.Effect<
    MaintenanceReport | undefined,
    unknown,
    MaintenanceServices
  >;
};

/** A check the worker repeats for as long as it runs (`apps/worker/src/maintenance.ts`). */
export type MaintenanceTask = MaintenanceCheck & {
  /** The spacing between runs. */
  readonly every: Duration.Input;
  /** Wait one spacing before the first run (boot runs the first one itself). */
  readonly delayFirst?: true;
};

/**
 * Reconcile Jobs: stale Jobs, the Case access recheck, stuck playbook runs,
 * orphaned queued Jobs, drifted Collect queue Cases, under an advisory lock (a
 * tick another worker holds the lock for does nothing). Boot runs one tick
 * itself, before the queue handler registers; the loop then waits a spacing
 * before each tick.
 */
export const JOB_RECONCILE: MaintenanceTask = {
  name: "worker.reconcile",
  failureMessage: "job reconcile failed",
  every: JOB_RECONCILE_INTERVAL,
  delayFirst: true,
  run: Effect.suspend(() => reconcileJobsEffect()).pipe(
    Effect.map(reconcileReport)
  ),
};

/**
 * Prune the activity log daily (ADR-0005 decision 8). The prune raises the
 * replay floor with each batch, so readers behind it resync instead of missing
 * rows. The worker is the one place it runs: the single instance the ADR assumes.
 */
export const ACTIVITY_PRUNE: MaintenanceTask = {
  name: "activity.retention",
  failureMessage: "activity prune failed",
  every: "24 hours",
  run: Effect.suspend(() => pruneActivityEffect()).pipe(
    Effect.map(activityPruneReport)
  ),
};

/**
 * Purge deleted Cases past the restore window hourly (#304): the Case, its
 * Graph and history, Evidence and files go; the permanent deletion record
 * stays. A Case whose files could not be erased stays deleted with its error
 * recorded, and the next run retries it. Safe beside a second worker or a Purge
 * now: each Case is locked with `SKIP LOCKED`.
 */
export const CASE_PURGE: MaintenanceTask = {
  name: "case.purge.run",
  failureMessage: "case purge run failed",
  every: "1 hour",
  run: Effect.suspend(() => purgeExpiredCasesEffect()).pipe(
    Effect.map(casePurgeReport)
  ),
};

/**
 * Delete the objects of presigned uploads never confirmed within the grace
 * window, hourly (#305). Bounded per run; a failed object delete rolls back, so
 * the records stay and are retried. Safe beside a second worker (`SKIP LOCKED`).
 */
export const UPLOAD_SWEEP: MaintenanceTask = {
  name: "evidence.upload-sweep.run",
  failureMessage: "upload sweep run failed",
  every: "1 hour",
  run: Effect.suspend(() => sweepAbandonedUploadsEffect()).pipe(
    Effect.map(uploadSweepReport)
  ),
};

/** Delete the counters of ended Job start windows, hourly (#480). Bounded, idempotent. */
export const JOB_START_PRUNE: MaintenanceTask = {
  name: "jobs.start-limits.prune",
  failureMessage: "Job start counter prune failed",
  every: "1 hour",
  run: Effect.suspend(() => pruneJobStartCountersEffect()).pipe(
    Effect.map(jobStartPruneReport)
  ),
};

/**
 * Delete the stored archives of large Case exports once their download link has
 * expired (`WD_EXPORT_LINK_TTL_HOURS`), hourly (#476). It reads each object's
 * own age, so it needs no database and is safe beside a second worker.
 */
export const EXPORT_SWEEP: MaintenanceTask = {
  name: "export.sweep.run",
  failureMessage: "export archive sweep run failed",
  every: "1 hour",
  run: Effect.suspend(() => sweepExpiredCaseExportsEffect()).pipe(
    Effect.map(exportSweepReport)
  ),
};

/**
 * Every task the worker repeats, in the order it forks them. Adding a task is
 * one entry here: scheduling, logging and failure handling come from the
 * worker's one loop.
 */
export const MAINTENANCE_TASKS: readonly MaintenanceTask[] = [
  JOB_RECONCILE,
  ACTIVITY_PRUNE,
  CASE_PURGE,
  UPLOAD_SWEEP,
  JOB_START_PRUNE,
  EXPORT_SWEEP,
];

/**
 * Boot check for a database restored from another cluster: `xid8` values in
 * the future would be held back forever, so they are rewritten before the
 * activity consumer starts. Run once, not repeated.
 */
export const ACTIVITY_RESTORE_CHECK: MaintenanceCheck = {
  name: "activity.restore",
  failureMessage: "activity xid boot check failed",
  run: Effect.suspend(() => repairRestoredActivityXidsEffect()).pipe(
    Effect.map(activityRestoreReport)
  ),
};
