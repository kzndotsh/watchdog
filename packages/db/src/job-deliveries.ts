import { and, eq, notExists, sql } from "drizzle-orm";

import type { DbExec } from "./exec";
import { jobs } from "./schema/jobs";

/**
 * Queued Jobs with no pending pg-boss delivery: none of their deliveries is `created`, `retry`
 * or `active` (pg-boss's pending states), because the delivery failed for good, completed or
 * was cancelled without the row being claimed, or is gone (retention). A delivery is found by
 * its `singleton_key`, which the enqueue sets to the Job id. One statement, one snapshot: the
 * enqueue inserts the delivery in the Job row's own transaction (#721), so a committed queued
 * Job always has its delivery visible beside it, and a just-made delivery is pending. No grace
 * window is needed.
 */
export async function listQueuedJobsWithoutDelivery(exec: DbExec) {
  return exec
    .select({
      id: jobs.id,
      caseId: jobs.caseId,
      playbookRunId: jobs.playbookRunId,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "queued"),
        notExists(
          sql`(select 1 from pgboss.job delivery
               where delivery.singleton_key = ${jobs.id}::text
                 and delivery.state in ('created', 'retry', 'active'))`
        )
      )
    );
}
