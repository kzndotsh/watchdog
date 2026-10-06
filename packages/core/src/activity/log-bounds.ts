import { Effect } from "effect";

import { activityFloorRepo, activityLogRepo } from "@watchdog/db";
import {
  compareActivityCursor,
  type ActivityCursor,
} from "@watchdog/schemas/feed";

import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";

const ORIGIN: ActivityCursor = { xid: "0", id: 0 };

/** What the log holds: its newest row and the retention floor (S7). */
export interface ActivityLogBounds {
  /** The newest row of any state; `null` for an empty log. */
  readonly newest: ActivityCursor | null;
  /** The newest position the prune job deleted; `null` when nothing was. */
  readonly floor: ActivityCursor | null;
}

export function readActivityLogBoundsEffect(): Effect.Effect<
  ActivityLogBounds,
  DomainTag,
  Db
> {
  return Effect.gen(function* readBoundsGen() {
    const newest = yield* tryDbWith((exec) => activityLogRepo.newest(exec));
    const floor = yield* tryDbWith((exec) => activityFloorRepo.get(exec));
    return { newest, floor };
  });
}

/**
 * The newest position the log has ever reached: its newest row, or the floor
 * when pruning (or a Case delete) left the log below it. A cursor above this
 * belongs to another database (a restore) and cannot be served.
 */
export function activityLogCeiling(bounds: ActivityLogBounds): ActivityCursor {
  const newest = bounds.newest ?? ORIGIN;
  const floor = bounds.floor ?? ORIGIN;
  return compareActivityCursor(newest, floor) >= 0 ? newest : floor;
}

/** True when `cursor` is below the retention floor: pruned entries may lie after it. */
export function isBelowActivityFloor(
  cursor: ActivityCursor,
  floor: ActivityCursor | null
): boolean {
  return floor !== null && compareActivityCursor(cursor, floor) < 0;
}

/**
 * A reader's cursor cannot be continued from the log: it is ahead of every
 * position the log has held (a restore or a wiped log), or below the retention
 * floor (entries after it were pruned). Either way what changed is unknowable
 * and the reader resyncs.
 */
export function isUnservableActivityCursor(
  cursor: ActivityCursor,
  bounds: ActivityLogBounds
): boolean {
  return (
    compareActivityCursor(cursor, activityLogCeiling(bounds)) > 0 ||
    isBelowActivityFloor(cursor, bounds.floor)
  );
}
