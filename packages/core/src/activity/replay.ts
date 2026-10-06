import { Effect } from "effect";

import { activityLogRepo } from "@watchdog/db";
import {
  compareActivityCursor,
  type ActivityCursor,
  type ActivityEntry,
} from "@watchdog/schemas/feed";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { toActivityEntry } from "./append";

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
 * restore, or a wiped log) or the client is more than `ACTIVITY_REPLAY_LIMIT`
 * entries behind; the client then refetches everything for the Case. There is
 * no retention floor yet (pruning lands in a later slice).
 */
export function replayActivityEffect(
  opts: ReplayActivityOpts
): Effect.Effect<ActivityReplay, DomainTag, Db> {
  return Effect.gen(function* replayActivityGen() {
    const newest = yield* tryDbWith((exec) => activityLogRepo.newest(exec));
    if (newest === null || compareActivityCursor(opts.after, newest) > 0) {
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
    return { kind: "entries", entries: rows.map(toActivityEntry) } as const;
  });
}
