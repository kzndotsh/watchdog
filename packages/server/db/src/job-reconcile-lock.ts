import { sql } from "drizzle-orm";

import type { DbExec } from "./exec";

/** One worker reconciles Jobs at a time ("WDJOBREC" as bytes). */
const JOB_RECONCILE_LOCK_KEY = 0x57_44_4a_4f_42_52_45_43n;

/**
 * Try the Job reconcile advisory lock until `exec`'s transaction ends. Returns false when
 * another worker holds it (the caller skips its tick; the lock is never waited for).
 */
export async function tryLockJobReconcile(exec: DbExec): Promise<boolean> {
  const rows = await exec.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(${JOB_RECONCILE_LOCK_KEY.toString()}::bigint) as locked`
  );
  return rows[0]?.locked;
}
