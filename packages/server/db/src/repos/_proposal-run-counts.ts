import { and, eq, getTableName, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { jobs } from "../schema/jobs";
import { proposals } from "../schema/proposals";

const runProposal = alias(proposals, "run_proposal");
const runJob = alias(jobs, "run_job");

/** `<table> <alias>`: an aliased table interpolated into raw `sql` renders as its alias alone. */
const aliased = (table: typeof proposals | typeof jobs, name: string) =>
  sql`${sql.identifier(getTableName(table))} ${sql.identifier(name)}`;

/**
 * How many Proposals the outer row's Playbook run (`jobs.playbook_run_id`) made, of any status and
 * on any page, or only the pending ones; null off a run. A queue row of the run then says the
 * run's size, not what one page loaded. A correlated count in the row's own statement: raw `sql`
 * by necessity, so it lives outside `*.repo.ts` like `_evidence-ids.ts`. Reads
 * `jobs_playbook_run_*` and `proposals_job_id_idx`.
 */
export function playbookRunProposalCount(
  status?: "pending"
): SQL<number | null> {
  const where = and(
    eq(runJob.playbookRunId, jobs.playbookRunId),
    status === undefined ? undefined : eq(runProposal.status, status)
  );
  return sql<
    number | null
  >`case when ${jobs.playbookRunId} is null then null else (
    select count(*)::int from ${aliased(proposals, "run_proposal")}
    join ${aliased(jobs, "run_job")} on ${runJob.id} = ${runProposal.jobId}
    where ${where}
  ) end`;
}
