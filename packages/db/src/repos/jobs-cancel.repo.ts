import { and, asc, count, eq, inArray } from "drizzle-orm";

import {
  type CaseId,
  CANCELLABLE_JOB_STATUSES,
  type JobStatus,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { jobs } from "../schema/jobs";
import { trimCaseId, trimResourceId } from "./_scoped-ids";

/** The vocabulary set as a mutable list for `inArray`; the repo defines no status set of its own. */
const CANCELLABLE_STATUSES: JobStatus[] = [...CANCELLABLE_JOB_STATUSES];

/** Which Jobs of a Case a selector names: one Job, a Playbook run's Jobs, or all of them. */
export type JobScope = {
  readonly caseId: CaseId;
  readonly jobId?: string;
  readonly playbookRunId?: string;
};

/** Reads over the Jobs a stop or cancel may touch. Spread into `jobsRepo`. Writes live in the lifecycle. */
export const jobsCancelRepo = {
  /** How many queued or running Jobs a Case has (what deleting it would cancel). */
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
   * The ids of the Jobs in `scope` whose status is one of `statuses`, in id order. The caller
   * passes the statuses the lifecycle table allows for its event (this repo keeps no status list
   * for a write), and settles each Job itself: this read names candidates, it changes nothing.
   */
  async listIdsInStatuses(
    exec: DbExec,
    scope: JobScope,
    statuses: readonly JobStatus[]
  ): Promise<string[]> {
    const caseId = trimCaseId(scope.caseId);
    if (caseId === undefined || statuses.length === 0) return [];
    const jobId =
      scope.jobId === undefined ? undefined : trimResourceId(scope.jobId);
    const playbookRunId =
      scope.playbookRunId === undefined
        ? undefined
        : trimResourceId(scope.playbookRunId);
    if (scope.jobId !== undefined && jobId === undefined) return [];
    if (scope.playbookRunId !== undefined && playbookRunId === undefined) {
      return [];
    }
    const rows = await exec
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, caseId),
          jobId === undefined ? undefined : eq(jobs.id, jobId),
          playbookRunId === undefined
            ? undefined
            : eq(jobs.playbookRunId, playbookRunId),
          inArray(jobs.status, [...statuses])
        )
      )
      .orderBy(asc(jobs.id));
    return rows.map((row) => row.id);
  },
};
