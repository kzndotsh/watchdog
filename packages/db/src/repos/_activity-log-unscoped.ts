import { getTableColumns, sql } from "drizzle-orm";

import type { ActivityCursor } from "@watchdog/schemas/feed";

import type { DbExec } from "../exec";
import { activity } from "../schema/activity";

/*
 * The activity log read as a whole, past the row-level security policy on `activity` (#719):
 * the SECURITY DEFINER functions `activity_log_drain`, `activity_log_has_past` and
 * `activity_log_newest` (migration `0004`). Only the process-wide readers call them: the tailer
 * (the live signal and the worker's export consumer) and a cursor's bounds. Raw SQL by necessity
 * (the builder cannot select from a function), kept beside the other raw fragments outside the
 * `*.repo.ts` scope of `watchdog/db-repo-no-raw-sql`.
 */

type ActivityRow = typeof activity.$inferSelect;

/**
 * The commit-safe entries of the whole log after `after`, oldest first, at most `limit`. The
 * function's rows are a CTE named `activity` with the table's own columns, so they decode as rows
 * of the table.
 */
export async function drainWholeLog(
  exec: DbExec,
  after: ActivityCursor,
  limit: number
): Promise<ActivityRow[]> {
  const drained = exec
    .$with("activity", getTableColumns(activity))
    .as(
      sql`select * from public.activity_log_drain(${after.xid}::xid8, ${after.id}::bigint, ${limit}::integer)`
    );
  return exec
    .with(drained)
    .select()
    .from(drained)
    .orderBy(drained.xid, drained.id);
}

/** True when any entry of the whole log, committed or not, sits past `after`. */
export async function wholeLogHasPast(
  exec: DbExec,
  after: ActivityCursor
): Promise<boolean> {
  const rows = await exec.execute<{ past: boolean }>(
    sql`select public.activity_log_has_past(${after.xid}::xid8, ${after.id}::bigint) as past`
  );
  return rows[0]?.past ?? false;
}

/** The newest position of the whole log: of the commit-safe entries, or of any. */
export async function wholeLogNewest(
  exec: DbExec,
  commitSafe: boolean
): Promise<ActivityCursor | null> {
  const rows = await exec.execute<{ xid: string; id: string | number }>(
    sql`select n.xid::text as xid, n.id from public.activity_log_newest(${commitSafe}) n`
  );
  const row = rows[0];
  return row === undefined ? null : { xid: row.xid, id: Number(row.id) };
}
