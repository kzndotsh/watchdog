import { and, eq, inArray } from "drizzle-orm";

import type { CaseId, JobStatus } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { jobs } from "../schema/jobs";
import {
  jobColumns,
  normalizeJobPatchIngress,
  setOrTouch,
  type JobRow,
  type JobSettlePatch,
} from "./_job-shapes";
import { trimScopedCaseIds } from "./_scoped-ids";

/** The one status writer for a Job's finish, fail, claim and reclaim. Spread into `jobsRepo`. */
export const jobsSettleRepo = {
  /**
   * Move a Job to `patch.status` only while its status is one of `fromStatuses`, and return the
   * updated row, or null when the Job is missing, in another Case or no longer in a status the
   * move may start from. The caller passes the statuses the lifecycle table allows for the
   * event, so no writer carries a guard of its own. A terminal status is never in that list.
   */
  async settle(
    exec: DbExec,
    caseId: CaseId,
    jobId: string,
    patch: JobSettlePatch,
    fromStatuses: readonly JobStatus[]
  ): Promise<JobRow | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped || fromStatuses.length === 0) return null;
    const { status, errorCode, ...rest } = patch;
    const normalized = normalizeJobPatchIngress(rest);
    if (normalized === null) return null;
    const { evidenceIds: _unused, ...columns } = normalized;
    const [updated] = await exec
      .update(jobs)
      .set(
        setOrTouch({
          ...columns,
          status,
          ...(errorCode === undefined ? {} : { errorCode }),
        })
      )
      .where(
        and(
          eq(jobs.id, scoped.resourceId),
          eq(jobs.caseId, scoped.caseId),
          inArray(jobs.status, [...fromStatuses])
        )
      )
      .returning(jobColumns);
    return updated ?? null;
  },
};
