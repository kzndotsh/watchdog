import { sql } from "drizzle-orm";

import type { DbExec } from "@watchdog/db";

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
