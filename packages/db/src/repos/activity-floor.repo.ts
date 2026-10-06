import { eq, sql } from "drizzle-orm";

import type { ActivityCursor } from "@watchdog/schemas/feed";

import type { DbExec } from "../exec";
import { activityFloor } from "../schema/activity";

/**
 * The activity log's retention floor (ADR-0005 decision 8): the newest position
 * the prune job ever deleted. A cursor below it may have missed pruned entries.
 */
export const activityFloorRepo = {
  /** `null` when nothing was ever pruned. */
  async get(exec: DbExec): Promise<ActivityCursor | null> {
    const [row] = await exec
      .select({ xid: activityFloor.xid, id: activityFloor.id })
      .from(activityFloor)
      .limit(1);
    return row === undefined ? null : { xid: row.xid, id: row.id };
  },

  /**
   * Move the floor forward to `cursor`; an equal or lower one is ignored (the
   * floor never retreats). `updated_at` is therefore the last time the floor
   * moved, not the last prune run.
   */
  async raise(exec: DbExec, cursor: ActivityCursor): Promise<void> {
    await exec
      .insert(activityFloor)
      .values({ xid: cursor.xid, id: cursor.id })
      .onConflictDoUpdate({
        target: activityFloor.singleton,
        set: {
          xid: cursor.xid,
          id: cursor.id,
          updatedAt: sql`now()`,
        },
        setWhere: sql`(${activityFloor.xid}, ${activityFloor.id}) < (${cursor.xid}::xid8, ${cursor.id})`,
      });
  },

  /** Restore repair: the floor's xid is rewritten with the log's (see `activityLogRepo.zeroXids`). */
  async zeroXid(exec: DbExec): Promise<void> {
    await exec
      .update(activityFloor)
      .set({ xid: sql`'0'::xid8` })
      .where(eq(activityFloor.singleton, true));
  },
};
