import { Effect } from "effect";

import {
  activityCursorsRepo,
  activityFloorRepo,
  activityLogRepo,
} from "@watchdog/db";

import type { Db } from "../infra/db-service";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import type { DomainTag } from "../infra/tagged-errors";

/** Entries older than this are pruned (ADR-0005 decision 8). */
export const ACTIVITY_RETENTION_DAYS = 90;
/** The newest entries of every Case are never pruned, however old. */
export const ACTIVITY_KEEP_PER_CASE = 200;
/** Rows deleted per transaction. */
export const ACTIVITY_PRUNE_BATCH = 5000;

const DAY_MS = 86_400_000;

export interface PruneActivityOpts {
  /** The clock; tests pin it. */
  readonly now?: Date;
  readonly retentionDays?: number;
  readonly keepPerCase?: number;
  readonly batchSize?: number;
}

export interface PruneActivityResult {
  readonly pruned: number;
  readonly batches: number;
}

/**
 * Delete entries older than the retention window (ADR-0005 decision 8), in
 * batches of `ACTIVITY_PRUNE_BATCH`, oldest position first, until none is left
 * to delete.
 *
 * - The newest `ACTIVITY_KEEP_PER_CASE` entries of each Case stay.
 * - Entries a live durable consumer has not read yet stay: the delete never
 *   passes the slowest consumer cursor that has moved inside the window. A
 *   consumer that has not moved for the whole window is abandoned and resyncs.
 * - Each batch raises the replay floor to the newest position it deleted in the
 *   same transaction, so no reader ever sees rows gone with the floor below
 *   them: a cursor under the floor gets `resync` in replay and in the worker
 *   consumer.
 *
 * The Case FK cascade (Case delete) removes entries without moving the floor:
 * those entries belong to a Case nobody can read.
 */
export function pruneActivityEffect(
  opts: PruneActivityOpts = {}
): Effect.Effect<PruneActivityResult, DomainTag, Db> {
  const now = opts.now ?? new Date();
  const before = new Date(
    now.getTime() - (opts.retentionDays ?? ACTIVITY_RETENTION_DAYS) * DAY_MS
  );
  const keepPerCase = opts.keepPerCase ?? ACTIVITY_KEEP_PER_CASE;
  const batchSize = opts.batchSize ?? ACTIVITY_PRUNE_BATCH;
  return Effect.gen(function* pruneActivityGen() {
    let pruned = 0;
    let batches = 0;
    for (;;) {
      const batch = yield* transact((tx) =>
        Effect.gen(function* pruneBatchGen() {
          const notPast = yield* tryDb(() =>
            activityCursorsRepo.slowestActive(tx, before)
          );
          const result = yield* tryDb(() =>
            activityLogRepo.pruneBatch(tx, {
              before,
              keepPerCase,
              limit: batchSize,
              notPast,
            })
          );
          if (result.newest !== null) {
            const { newest } = result;
            yield* tryDb(() => activityFloorRepo.raise(tx, newest));
          }
          return result;
        })
      );
      if (batch.count === 0) return { pruned, batches };
      pruned += batch.count;
      batches += 1;
      if (batch.count < batchSize) return { pruned, batches };
    }
  });
}
