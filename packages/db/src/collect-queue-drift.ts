import { sql } from "drizzle-orm";

import type { DbExec } from "./exec";

/** Why the drift check would rebuild a Case's queue projection (`collect_queue_find_drift`). */
export type CollectQueueDriftReason = "stale" | "fingerprint" | "diff";

export type CollectQueueDrift = {
  readonly caseId: string;
  readonly reason: CollectQueueDriftReason;
};

/**
 * Collect's queue (#574): the live Cases whose projection may be wrong, once each with the first
 * reason found. A flush that failed (`stale`), counts that disagree for the `limit` Cases counted
 * longest ago (`fingerprint`), or a full comparison of the one Case compared longest ago (`diff`).
 * Advances the round robin as it goes.
 */
export async function findCollectQueueDrift(
  exec: DbExec,
  limit: number
): Promise<CollectQueueDrift[]> {
  const rows = await exec.execute<{
    drift_case_id: string;
    drift_reason: CollectQueueDriftReason;
  }>(sql`select * from public.collect_queue_find_drift(${limit}::integer)`);
  const seen = new Map<string, CollectQueueDriftReason>();
  for (const row of rows) {
    if (!seen.has(row.drift_case_id))
      seen.set(row.drift_case_id, row.drift_reason);
  }
  return [...seen].map(([caseId, reason]) => ({ caseId, reason }));
}

/** Recompute a Case's whole queue projection under its lock, and clear its stale marks. */
export async function rebuildCollectQueue(
  exec: DbExec,
  caseId: string
): Promise<void> {
  await exec.execute(sql`select public.collect_queue_rebuild(${caseId}::uuid)`);
}
