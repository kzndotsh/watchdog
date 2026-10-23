import { Effect } from "effect";

import type { Db } from "../infra/db-service";
import { transact } from "../infra/postgres-tx";
import { jobStartCountersRepoFx } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";
import { jobStartLimitSettings } from "./start-limits";

/** Rows deleted per transaction. */
const JOB_START_PRUNE_BATCH = 1000;
/** Batches per run, so one run is bounded; the next run takes the rest. */
const JOB_START_PRUNE_MAX_BATCHES = 50;

export type JobStartPruneSummary = { readonly removed: number };

/**
 * Delete the Job start counters of windows that ended, for every subject (a subject's own first
 * start of a window only clears its own earlier rows, so idle and deleted keys and organizations
 * would keep one row forever). One transaction per batch of at most `batch` rows, at most
 * `maxBatches` batches a run; returns how many rows went. Idempotent and safe beside a second
 * worker: a row is deleted once, and the current window's rows are never touched.
 */
export function pruneJobStartCountersEffect(
  opts: { batch?: number; maxBatches?: number } = {}
): Effect.Effect<JobStartPruneSummary, DomainTag, Db> {
  const batch = opts.batch ?? JOB_START_PRUNE_BATCH;
  const maxBatches = opts.maxBatches ?? JOB_START_PRUNE_MAX_BATCHES;
  return Effect.gen(function* pruneJobStartCountersGen() {
    const { windowSeconds } = jobStartLimitSettings();
    let removed = 0;
    for (let run = 0; run < maxBatches; run += 1) {
      const deleted = yield* transact((tx) =>
        jobStartCountersRepoFx.pruneEnded(tx, windowSeconds, batch)
      );
      removed += deleted;
      if (deleted < batch) break;
    }
    return { removed };
  });
}
