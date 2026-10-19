import { sql } from "drizzle-orm";

import type { DbExec } from "@watchdog/db";

/**
 * How many backends are waiting on a lock while running a statement whose text contains every
 * given fragment (lower case). A race test polls this (`vi.waitFor`) to know the second
 * transaction is blocked before it lets the first one finish, instead of sleeping.
 */
export async function countLockWaiters(
  exec: DbExec,
  fragments: readonly string[]
): Promise<number> {
  const rows = await exec.execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where wait_event_type = 'Lock'
      and ${sql.join(
        fragments.map((f) => sql`lower(query) like ${`%${f}%`}`),
        sql` and `
      )}`);
  return rows[0]?.n ?? 0;
}
