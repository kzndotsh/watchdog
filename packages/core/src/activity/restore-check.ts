import { Effect } from "effect";

import {
  activityCursorsRepo,
  activityFloorRepo,
  activityLogRepo,
} from "@watchdog/db";

import type { Db } from "../infra/db-service";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import type { DomainTag } from "../infra/tagged-errors";

export interface RepairRestoredXidsResult {
  /** Entries whose `xid` was rewritten to 0; 0 when the log was healthy. */
  readonly repaired: number;
}

/**
 * Boot check for a database restored from another cluster (ADR-0005 failure
 * mode 2). An `xid8` is a transaction id of the cluster that wrote the row; a
 * `pg_dump` restored into a fresh cluster can carry values this cluster has not
 * handed out yet. Such a row is never below `pg_snapshot_xmin`, so the tailer,
 * replay and the worker would hold it back forever.
 *
 * When any entry's `xid` is at or past the cluster's next transaction id, every
 * entry's `xid` is rewritten to 0 (not only the future ones: ids keep the
 * insertion order, `(0, id)` is a total order, and a partial rewrite would sort
 * the restored tail before older rows), as are the retention floor and every
 * durable consumer cursor, in one transaction. A consumer cursor then still
 * points at the same entry, and a browser cursor from the old cluster is ahead
 * of the log and gets `resync`. Idempotent: a repaired log has nothing in the
 * future. Run it once at worker boot, before the consumer starts.
 */
export function repairRestoredActivityXidsEffect(): Effect.Effect<
  RepairRestoredXidsResult,
  DomainTag,
  Db
> {
  return Effect.gen(function* repairRestoredXidsGen() {
    const future = yield* tryDbWith((exec) =>
      activityLogRepo.hasFutureXid(exec)
    );
    if (!future) return { repaired: 0 };
    return yield* transact((tx) =>
      Effect.gen(function* repairBodyGen() {
        const repaired = yield* tryDb(() => activityLogRepo.zeroXids(tx));
        yield* tryDb(() => activityFloorRepo.zeroXid(tx));
        yield* tryDb(() => activityCursorsRepo.zeroXids(tx));
        return { repaired };
      })
    );
  });
}
