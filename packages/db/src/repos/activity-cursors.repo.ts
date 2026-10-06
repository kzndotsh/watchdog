import { eq, gte, sql } from "drizzle-orm";

import type { ActivityCursor } from "@watchdog/schemas/feed";

import type { DbExec } from "../exec";
import { activityCursors } from "../schema/activity";

/**
 * Durable read positions in the activity log, one per named consumer
 * (ADR-0005 S5). The caller decides when a position is safe to store: after it
 * has handled every entry up to and including the cursor.
 */
export const activityCursorsRepo = {
  async get(exec: DbExec, consumer: string): Promise<ActivityCursor | null> {
    const [row] = await exec
      .select({ xid: activityCursors.xid, id: activityCursors.id })
      .from(activityCursors)
      .where(eq(activityCursors.consumer, consumer))
      .limit(1);
    return row === undefined ? null : { xid: row.xid, id: row.id };
  },

  /** Upsert, in either direction: a resync moves a stale cursor back to the head. */
  async set(
    exec: DbExec,
    consumer: string,
    cursor: ActivityCursor
  ): Promise<void> {
    await exec
      .insert(activityCursors)
      .values({ consumer, xid: cursor.xid, id: cursor.id })
      .onConflictDoUpdate({
        target: activityCursors.consumer,
        set: { xid: cursor.xid, id: cursor.id, updatedAt: sql`now()` },
      });
  },

  /**
   * The lowest position among consumers whose cursor moved at or after `since`,
   * `null` when there is none. A consumer that has not moved for the whole
   * retention window is abandoned: pruning does not wait for it (it resyncs).
   */
  async slowestActive(
    exec: DbExec,
    since: Date
  ): Promise<ActivityCursor | null> {
    const [row] = await exec
      .select({ xid: activityCursors.xid, id: activityCursors.id })
      .from(activityCursors)
      .where(gte(activityCursors.updatedAt, since))
      .orderBy(activityCursors.xid, activityCursors.id)
      .limit(1);
    return row === undefined ? null : { xid: row.xid, id: row.id };
  },

  /** Restore repair: every cursor's xid is rewritten with the log's (see `activityLogRepo.zeroXids`). */
  async zeroXids(exec: DbExec): Promise<void> {
    await exec.update(activityCursors).set({ xid: sql`'0'::xid8` });
  },
};
