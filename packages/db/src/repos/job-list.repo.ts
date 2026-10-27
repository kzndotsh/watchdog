import { eq, inArray } from "drizzle-orm";

import { jobList } from "@watchdog/schemas/jobs";

import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { jobListColumns } from "./_job-shapes";
import { defineListRepo } from "./_list-query";

/**
 * The Case's Job list (`jobList`, ADR-0007): every Job of the Case, one row each (the Job's
 * columns flat, as `JobListRow` reads them), with the playbook run it belongs to (a display join: never filtered, sorted or searched, so the capped
 * count reads `jobs` alone). A playbook run's steps are this list with `playbookRunId` set,
 * served by `jobs_playbook_run_updated_idx`.
 */
export const jobListRepo = defineListRepo(jobList, {
  table: jobs,
  base: (exec, listKey) =>
    exec
      .select({
        ...jobListColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
        playbookRunOutcome: playbookRuns.outcome,
        listKey,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .$dynamic(),
  id: jobs.id,
  scopeColumn: jobs.caseId,
  scope: ({ caseId }) => eq(jobs.caseId, caseId),
  filters: {
    status: (statuses) =>
      statuses.length > 0 ? inArray(jobs.status, [...statuses]) : undefined,
    capability: (ids) =>
      ids.length > 0 ? inArray(jobs.capabilityId, [...ids]) : undefined,
    playbookRunId: (id) =>
      id === null ? undefined : eq(jobs.playbookRunId, id),
  },
  // `jobs_playbook_run_updated_idx (playbook_run_id, updated_at desc, id desc)`
  selective: { playbookRunId: jobs.playbookRunId },
  // `jobs_case_updated_idx` and `jobs_case_created_idx`, led by `case_id`
  sorts: { updated: jobs.updatedAt, created: jobs.createdAt },
  searchLabels: { status: jobs.status },
  search: {
    capabilityId: jobs.capabilityId,
    resultSummary: jobs.resultSummary,
    error: jobs.error,
  },
});

/** A row of the Job list: the Job with its playbook run's state, and its cursor value. */
export type JobListPageRow = Awaited<
  ReturnType<typeof jobListRepo.page>
>[number];
