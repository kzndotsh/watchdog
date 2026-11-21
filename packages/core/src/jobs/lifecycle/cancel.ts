import { Effect } from "effect";

import { jobQueueTx, listPendingJobDeliveries, type DbTx } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

import type { DomainTag } from "../../errors/tagged-errors";
import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { tryDb } from "../../infra/postgres-effect";
import { jobsRepoFx } from "../../infra/repos-fx";
import { JobFibers } from "../job-fibers";
import { JobQueue } from "../job-queue";
import { settleJobInTx } from "./settle";
import type { CancelCause } from "./stop-slot";
import { allowedFromStatuses } from "./table";
import { advancePlaybookTailEffect } from "./tail";

/** Which open Jobs a cancel names: one Job, the Jobs of a Playbook run, or all of a Case's. */
export type CancelSelector =
  | { readonly kind: "job"; readonly caseId: CaseId; readonly jobId: string }
  | { readonly kind: "case"; readonly caseId: CaseId }
  | {
      readonly kind: "playbookRun";
      readonly caseId: CaseId;
      readonly playbookRunId: string;
    };

/** A Job this cancel moved to `cancelled`. */
type CancelledJob = {
  readonly jobId: string;
  readonly caseId: CaseId;
  readonly playbookRunId: string | null;
};

/** What a cancel did inside the transaction, and what is left to do once it has committed. */
export type CancelOutcome = {
  readonly cancelled: readonly CancelledJob[];
  /**
   * Run this after the transaction has committed, never inside it: it aborts the fiber of each
   * cancelled Job that this process runs (a worker elsewhere learns it from pg-boss: the
   * delivery was cancelled in the transaction, and its next heartbeat refresh aborts
   * `job.signal`), then lets each Playbook run react. Dropping it on a rollback is what makes a rolled-back cancel
   * leave nothing behind.
   */
  readonly afterCommit: Effect.Effect<void, never, Db | JobQueue>;
};

function scopeOf(selector: CancelSelector) {
  if (selector.kind === "job") {
    return { caseId: selector.caseId, jobId: selector.jobId };
  }
  if (selector.kind === "playbookRun") {
    return { caseId: selector.caseId, playbookRunId: selector.playbookRunId };
  }
  return { caseId: selector.caseId };
}

function afterCommitEffect(
  cancelled: readonly CancelledJob[],
  cause: CancelCause
): Effect.Effect<void, never, Db | JobQueue> {
  return Effect.gen(function* afterCancelCommit() {
    const fibers = yield* Effect.serviceOption(JobFibers);
    if (fibers._tag === "Some") {
      yield* Effect.forEach(
        cancelled,
        (job) => fibers.value.abort(job.jobId, { cause }),
        { concurrency: "unbounded", discard: true }
      );
    }
    // The run reads its Jobs' statuses, so one advance per run covers all of its Jobs.
    const runs = new Map<string, CancelledJob>();
    for (const job of cancelled) {
      if (job.playbookRunId !== null) runs.set(job.playbookRunId, job);
    }
    yield* Effect.forEach(
      runs.values(),
      (job) => advancePlaybookTailEffect(job),
      {
        discard: true,
      }
    );
  });
}

/**
 * Cancel the open Jobs a selector names, inside the caller's transaction (the API cancel, a Case
 * delete, reconcile's access check). Each Job moves through the lifecycle table with a `cancel`
 * event, so a Job that is already terminal is left alone and the guard is the table's; each move
 * appends its one activity entry in the same transaction. The cancelled Jobs' pending pg-boss
 * deliveries (found by `singleton_key` = Job id) are cancelled through pg-boss on the same
 * transaction (#722): a queued Job is never delivered, a running attempt is aborted by its
 * fenced heartbeat, and a rollback leaves both as they were. Nothing else outside the database
 * happens here: the returned `afterCommit` does it once the caller's transaction has committed.
 * `error` is the Job's error text (reconcile's access message); without it none is written.
 *
 * @canonical `cancelWithin`: Cancel Jobs inside the caller's transaction (API cancel, Case delete; `afterCommit` aborts fibers and advances runs)
 */
export function cancelWithin(
  tx: DbTx,
  selector: CancelSelector,
  cause: CancelCause,
  error?: string
): Effect.Effect<CancelOutcome, DomainTag, JobQueue> {
  return Effect.gen(function* cancelWithinGen() {
    const ids = yield* jobsRepoFx.listIdsInStatuses(
      tx,
      scopeOf(selector),
      allowedFromStatuses("cancel")
    );
    const finishedAt = yield* nowDateEffect;
    const cancelled: CancelledJob[] = [];
    for (const jobId of ids) {
      const row = yield* settleJobInTx(
        tx,
        { jobId, caseId: selector.caseId },
        { kind: "cancel", cause },
        error === undefined ? { finishedAt } : { finishedAt, error }
      );
      if (row !== null) {
        cancelled.push({
          jobId: row.id,
          caseId: row.caseId,
          playbookRunId: row.playbookRunId,
        });
      }
    }
    if (cancelled.length > 0) {
      const deliveries = yield* tryDb(() =>
        listPendingJobDeliveries(
          tx,
          cancelled.map((job) => job.jobId)
        )
      );
      const queue = yield* JobQueue;
      yield* queue.cancel(jobQueueTx(tx), deliveries);
    }
    return { cancelled, afterCommit: afterCommitEffect(cancelled, cause) };
  });
}
