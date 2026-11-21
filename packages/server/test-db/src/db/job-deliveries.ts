import { sql } from "drizzle-orm";

import type { DbExec } from "#db";

/** pg-boss deliveries (rows of `pgboss.job`, any lane or state) whose payload names `jobId`. */
export async function countJobDeliveries(
  exec: DbExec,
  jobId: string
): Promise<number> {
  const rows = await exec.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job where data->>'jobId' = ${jobId}`
  );
  return rows[0]?.n ?? 0;
}

/** Put every pg-boss delivery of `jobId` in `state` (a pg-boss job state), as pg-boss would. */
export async function setJobDeliveryState(
  exec: DbExec,
  jobId: string,
  state: "created" | "retry" | "active" | "completed" | "cancelled" | "failed"
): Promise<void> {
  await exec.execute(
    sql`update pgboss.job set state = ${state}::pgboss.job_state where data->>'jobId' = ${jobId}`
  );
}

/** Delete every pg-boss delivery of `jobId`, as pg-boss's retention does. */
export async function deleteJobDeliveries(
  exec: DbExec,
  jobId: string
): Promise<void> {
  await exec.execute(
    sql`delete from pgboss.job where data->>'jobId' = ${jobId}`
  );
}

/** The pg-boss states of `jobId`'s deliveries (any lane), oldest first. */
export async function listJobDeliveryStates(
  exec: DbExec,
  jobId: string
): Promise<string[]> {
  const rows = await exec.execute<{ state: string }>(
    sql`select state::text as state from pgboss.job where data->>'jobId' = ${jobId} order by created_on`
  );
  return rows.map((row) => row.state);
}
