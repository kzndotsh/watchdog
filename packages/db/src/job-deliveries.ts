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

/** A pending pg-boss delivery: its pg-boss id and the queue (lane) it waits in. */
export type PendingJobDelivery = {
  readonly id: string;
  readonly queue: string;
};

/**
 * The pending (`created`, `retry` or `active`) pg-boss deliveries of the given Jobs, found by
 * `singleton_key` = Job id, so a cancel can cancel them through pg-boss in its own transaction
 * (#722). Read on `exec`, so a delivery inserted in the same transaction is seen.
 */
export async function listPendingJobDeliveries(
  exec: DbExec,
  jobIds: readonly string[]
): Promise<PendingJobDelivery[]> {
  if (jobIds.length === 0) return [];
  const rows = await exec.execute<{ id: string; queue: string }>(
    sql`select delivery.id::text as id, delivery.name as queue
        from pgboss.job delivery
        where delivery.singleton_key in ${[...jobIds]}
          and delivery.state in ('created', 'retry', 'active')`
  );
  return rows.map((row) => ({ id: row.id, queue: row.queue }));
}
