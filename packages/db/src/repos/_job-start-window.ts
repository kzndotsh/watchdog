import { sql } from "drizzle-orm";

import type { DbExec } from "../exec";
import { jobStartCounters } from "../schema/job-start-limits";

/**
 * The start of the fixed window the database clock is in now: epoch seconds floored to a multiple
 * of `windowSeconds`. Every process asks the same clock, so they all agree which window a start
 * belongs to. Raw `sql` lives here, outside `*.repo.ts`, like `_db-now.ts`.
 */
export function windowStartSql(windowSeconds: number) {
  return sql`to_timestamp((floor(extract(epoch from now()) / (${windowSeconds})::numeric) * (${windowSeconds})::numeric)::float8)`;
}

/** Whole seconds until the current window ends (at least 1), by the database clock. */
export async function secondsToWindowEnd(
  exec: DbExec,
  windowSeconds: number
): Promise<number> {
  const rows = await exec.execute<{ seconds: number }>(
    sql`select greatest(1, ceil((${windowSeconds})::numeric - mod(extract(epoch from now()), (${windowSeconds})::numeric)))::int as seconds`
  );
  return rows[0]?.seconds ?? windowSeconds;
}

/** The upsert's increment: one more start in the window. */
export const countPlusOne = sql`${jobStartCounters.count} + 1`;
