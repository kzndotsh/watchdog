import { and, count, eq, inArray } from "drizzle-orm";

import {
  type CaseId,
  CANCELLABLE_JOB_STATUSES,
  type JobStatus,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { jobs } from "../schema/jobs";
import { jobActivityColumns, type JobActivityFields } from "./_job-activity";
import { trimCaseId, trimResourceId, trimScopedCaseIds } from "./_scoped-ids";

/** The vocabulary set as a mutable list for `inArray`; the repo defines no status set of its own. */
export const CANCELLABLE_STATUSES: JobStatus[] = [...CANCELLABLE_JOB_STATUSES];

/** Cancelling Jobs: one Job, or everything a Case still has queued, running or blocked. Spread into `jobsRepo`. */
export const jobsCancelRepo = {
  async cancelCancellable(
    exec: DbExec,
    jobId: string,
    finishedAt: Date
  ): Promise<string | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const [updated] = await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt,
      })
      .where(
        and(
          eq(jobs.id, scopedJobId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      )
      .returning({ id: jobs.id });
    return updated?.id ?? null;
  },

  /** How many queued, running or blocked Jobs a Case has (what deleting it would cancel). */
  async countCancellableForCase(exec: DbExec, caseId: CaseId): Promise<number> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return 0;
    const [row] = await exec
      .select({ n: count() })
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      );
    return row?.n ?? 0;
  },

  /**
   * Cancel every queued, running or blocked Job of a Case in one statement (a Case delete stops
   * its work). Returns the cancelled Jobs' activity fields; the worker's cancel poll aborts the
   * running ones from the status.
   */
  async cancelAllCancellableForCase(
    exec: DbExec,
    caseId: CaseId,
    finishedAt: Date
  ): Promise<JobActivityFields[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .update(jobs)
      .set({ status: "cancelled", finishedAt })
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      )
      .returning(jobActivityColumns);
  },

  async cancelCancellableInCase(
    exec: DbExec,
    caseId: CaseId,
    jobId: string,
    finishedAt: Date
  ): Promise<string | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const [updated] = await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt,
      })
      .where(
        and(
          eq(jobs.id, scoped.resourceId),
          eq(jobs.caseId, scoped.caseId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      )
      .returning({ id: jobs.id });
    return updated?.id ?? null;
  },
};
