import { Effect } from "effect";

import { activityFloorRepo, activityLogRepo } from "@watchdog/db";
import type { ActivityCursor, ActivityEntry } from "@watchdog/schemas/feed";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { toActivityEntry } from "./append";
import {
  isBelowActivityFloor,
  isUnservableActivityCursor,
  readActivityLogBoundsEffect,
} from "./log-bounds";

/** Most entries one replay sends; a client further behind gets `resync`. */
export const ACTIVITY_REPLAY_LIMIT = 500;

export type ActivityReplay =
  | { readonly kind: "entries"; readonly entries: ActivityEntry[] }
  | { readonly kind: "resync" };

export interface ReplayActivityOpts {
  organizationId: OrganizationId;
  /** Narrow to one Case (the SSE `caseId` filter). */
  caseId?: CaseId;
  /** The last cursor the client saw (`Last-Event-ID`, `?after=`). */
  after: ActivityCursor;
}

/**
 * Entries a reconnecting client missed, in `(xid, id)` order, read from the
 * log under the same commit-safe rule as the live tailer (rows of a still-open
 * transaction arrive later, from the live path).
 *
 * `resync` instead of entries when the cursor is ahead of the database (a
 * restore, or a wiped log), below the retention floor (the prune job deleted
 * entries after it) or more than `ACTIVITY_REPLAY_LIMIT` entries behind; the
 * client then refetches everything for the Case.
 */
export function replayActivityEffect(
  opts: ReplayActivityOpts
): Effect.Effect<ActivityReplay, DomainTag, Db> {
  return Effect.gen(function* replayActivityGen() {
    const bounds = yield* readActivityLogBoundsEffect();
    if (isUnservableActivityCursor(opts.after, bounds)) {
      return { kind: "resync" } as const;
    }
    const rows = yield* tryDbWith((exec) =>
      activityLogRepo.drain(exec, {
        after: opts.after,
        limit: ACTIVITY_REPLAY_LIMIT + 1,
        organizationId: opts.organizationId,
        caseId: opts.caseId,
      })
    );
    if (rows.length > ACTIVITY_REPLAY_LIMIT) {
      return { kind: "resync" } as const;
    }
    // A prune that committed after the bounds read but before the drain removed
    // rows the drain cannot return; it raised the floor in the same transaction,
    // so the floor read after the drain sees it.
    const floorAfter = yield* tryDbWith((exec) => activityFloorRepo.get(exec));
    if (isBelowActivityFloor(opts.after, floorAfter)) {
      return { kind: "resync" } as const;
    }
    return { kind: "entries", entries: rows.map(toActivityEntry) } as const;
  });
}
