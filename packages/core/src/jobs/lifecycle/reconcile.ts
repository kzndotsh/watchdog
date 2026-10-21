import { Cause, Clock, Effect, Result } from "effect";

import {
  casesRepo,
  jobsRepo,
  playbookRunsRepo,
  tryLockJobReconcile,
} from "@watchdog/db";
import { isOpenJobStatus, type CaseId } from "@watchdog/schemas/shared";

import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { errorMessage } from "../../infra/error-utils";
import { tryDb, tryDbWith } from "../../infra/postgres-effect";
import { outsideTransaction, transact } from "../../infra/postgres-tx";
import { logSwallowed } from "../../infra/process-log";
import type { DomainTag } from "../../infra/tagged-errors";
import { enqueueCapJobEffect } from "../boss";
import { jobAccessLostReasonEffect } from "../job-access";
import type { JobQueue } from "../job-queue";
import { advancePlaybookRunEffect } from "../stages/chain";
import { capExpireSeconds } from "../timeouts";
import { settleJobEffect } from "./settle";

/** How often the worker runs a reconcile tick (the worker schedules it; its loop takes a shorter one in tests). */
export const JOB_RECONCILE_INTERVAL = "60 seconds" as const;

const STALE_ERROR =
  "This Job ran past its Capability time window and no worker finished it";

/** Avoid re-enqueueing jobs still in the normal web→boss handoff window. */
const ORPHAN_QUEUED_GRACE_MS = 120_000;

/** Repairs run a few at a time: the tick's lock transaction already holds one connection. */
const REPAIR_CONCURRENCY = 4;

type RunningJobRow = Awaited<ReturnType<typeof jobsRepo.listRunning>>[number];

/** What one {@link reconcileJobsEffect} tick did; `ran` is false when another worker held the lock. */
export type JobReconcileResult = {
  readonly ran: boolean;
  /** Running Jobs failed as stale (past their Cap's window, or of an unknown Cap). */
  readonly stale: number;
  /** Running Jobs cancelled because their creator lost access to the Case. */
  readonly accessRevoked: number;
  /** Playbook runs with no open Job that were advanced again. */
  readonly stuckPlaybooks: number;
  /** Queued Jobs with no delivery that were enqueued again. */
  readonly orphanedQueued: number;
};

const SKIPPED: JobReconcileResult = {
  ran: false,
  stale: 0,
  accessRevoked: 0,
  stuckPlaybooks: 0,
  orphanedQueued: 0,
};

function capExpireOrUnknown(
  capabilityId: string
):
  | { readonly ok: true; readonly expireSeconds: number }
  | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, expireSeconds: capExpireSeconds(capabilityId) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

function abandonPlaybook(
  jobId: string,
  playbookRunId: string | null,
  caseId: CaseId
): Effect.Effect<void, never, Db | JobQueue> {
  if (playbookRunId === null) return Effect.void;
  return advancePlaybookRunEffect({ playbookRunId, caseId }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed("reconcile.abandon", Cause.squash(cause), { jobId });
      })
    )
  );
}

type RunningVerdict = "stale" | "access_revoked" | "none";

/**
 * Repair one running Job at most once per tick: stale (or unknown Cap) first, then the
 * Case access recheck. A settle that moved nothing (the Job ended meanwhile) counts nothing.
 */
function repairRunningJobEffect(
  row: RunningJobRow,
  now: number
): Effect.Effect<RunningVerdict, DomainTag, Db | JobQueue> {
  return Effect.gen(function* repairRunningJobGen() {
    const target = { jobId: row.id, caseId: row.caseId };
    const finishedAt = yield* nowDateEffect;
    const cap = capExpireOrUnknown(row.capabilityId);
    const stale = cap.ok
      ? now - (row.startedAt ?? row.updatedAt).getTime() >=
        cap.expireSeconds * 1000
      : true;
    if (stale) {
      const settled = yield* settleJobEffect(
        target,
        { kind: "fail", cause: cap.ok ? "stale" : "preflight_failed" },
        {
          error: cap.ok
            ? STALE_ERROR
            : `Unknown Capability ${row.capabilityId}: ${cap.message}`,
          logs: [],
          finishedAt,
        }
      );
      if (settled === null) return "none" as const;
      yield* abandonPlaybook(row.id, row.playbookRunId, row.caseId);
      return "stale" as const;
    }
    // A deleted Case cancels its own Jobs and is invisible here: only a live Case is rechecked.
    const caseRow = yield* tryDbWith((exec) =>
      casesRepo.getByIdUnchecked(exec, row.caseId)
    );
    if (caseRow === null) return "none" as const;
    const accessLost = yield* jobAccessLostReasonEffect(
      row,
      caseRow.organizationId
    );
    if (accessLost === null) return "none" as const;
    // The local fiber stops through the cancel poll, which sees the status change.
    const settled = yield* settleJobEffect(
      target,
      { kind: "cancel", cause: "access_revoked" },
      { error: accessLost, finishedAt }
    );
    if (settled === null) return "none" as const;
    yield* abandonPlaybook(row.id, row.playbookRunId, row.caseId);
    return "access_revoked" as const;
  });
}

function repairRunningJobsEffect(): Effect.Effect<
  { readonly stale: number; readonly accessRevoked: number },
  DomainTag,
  Db | JobQueue
> {
  return Effect.gen(function* repairRunningJobsGen() {
    const running = yield* tryDbWith((exec) => jobsRepo.listRunning(exec));
    const now = yield* Clock.currentTimeMillis;
    const verdicts = yield* Effect.forEach(
      running,
      (row) => repairRunningJobEffect(row, now),
      { concurrency: REPAIR_CONCURRENCY }
    );
    return {
      stale: verdicts.filter((v) => v === "stale").length,
      accessRevoked: verdicts.filter((v) => v === "access_revoked").length,
    };
  });
}

/**
 * Re-enqueue product Jobs left `queued` without a pg-boss delivery (enqueue
 * failed after commit). `singletonKey` on send makes repeat enqueue safe.
 */
export function reconcileOrphanedQueuedJobsEffect(): Effect.Effect<
  number,
  DomainTag,
  Db | JobQueue
> {
  return Effect.gen(function* reconcileOrphanedQueuedJobsGen() {
    const now = yield* Clock.currentTimeMillis;
    // Drizzle `listQueuedStale` expects a JS Date; Clock supplies the millis.
    // oxlint-disable-next-line effecttsgo/global-date-in-effect -- repo boundary Date interop
    const updatedBefore = new Date(now - ORPHAN_QUEUED_GRACE_MS);
    const rows = yield* tryDbWith((exec) =>
      jobsRepo.listQueuedStale(exec, updatedBefore)
    );
    let enqueued = 0;
    for (const row of rows) {
      const outcome = yield* Effect.result(
        enqueueCapJobEffect(row.id, row.capabilityId)
      );
      if (Result.isFailure(outcome)) {
        yield* Effect.sync(() => {
          logSwallowed("reconcile.orphan_queued", outcome.failure, {
            jobId: row.id,
          });
        });
        continue;
      }
      enqueued += 1;
    }
    return enqueued;
  });
}

/** Re-advance playbook runs left `running` after a swallowed advance error. */
function reconcileStuckPlaybookRunsEffect(): Effect.Effect<
  number,
  DomainTag,
  Db | JobQueue
> {
  return Effect.gen(function* reconcileStuckPlaybookRunsGen() {
    const running = yield* tryDbWith((exec) =>
      playbookRunsRepo.listRunning(exec)
    );
    const results = yield* Effect.forEach(
      running,
      (run) =>
        Effect.gen(function* reconcileOnePlaybookGen() {
          const members = yield* tryDbWith((exec) =>
            jobsRepo.listStatusesForPlaybookRun(exec, run.id)
          );
          if (members.some((m) => isOpenJobStatus(m.status))) return false;
          return yield* advancePlaybookRunEffect({
            playbookRunId: run.id,
            caseId: run.caseId,
          }).pipe(
            Effect.as(true),
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                logSwallowed(
                  "reconcile.playbook_advance",
                  Cause.squash(cause),
                  { playbookRunId: run.id }
                );
                return false;
              })
            )
          );
        }),
      { concurrency: "unbounded" }
    );
    return results.filter(Boolean).length;
  });
}

/** One repair step: a failure is logged and counts zero, so one broken step never blocks the rest. */
function guarded<A>(
  step: string,
  effect: Effect.Effect<A, DomainTag, Db | JobQueue>,
  fallback: A
): Effect.Effect<A, never, Db | JobQueue> {
  return effect.pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed(`reconcile.${step}`, Cause.squash(cause));
        return fallback;
      })
    )
  );
}

/**
 * One reconcile tick: fail stale running Jobs, cancel running Jobs whose creator lost access
 * to the Case (`access_revoked`), re-advance stuck playbook runs and re-enqueue orphaned
 * queued Jobs. Every status change goes through `settleJobEffect`: one guarded write and one
 * activity entry per repair, and a second tick changes nothing.
 *
 * A transaction-scoped advisory lock lets one worker reconcile at a time: a worker that does
 * not get it returns `ran: false` at once and never waits. The repairs run outside the lock's
 * transaction on their own connections (`outsideTransaction`), so the lock is held until the
 * whole tick ends. The worker runs it at boot and then every {@link JOB_RECONCILE_INTERVAL}.
 */
export function reconcileJobsEffect(): Effect.Effect<
  JobReconcileResult,
  DomainTag,
  Db | JobQueue
> {
  return transact((tx) =>
    Effect.gen(function* reconcileJobsGen() {
      const locked = yield* tryDb(() => tryLockJobReconcile(tx));
      if (!locked) return SKIPPED;
      return yield* outsideTransaction(
        Effect.gen(function* reconcileJobsLockedGen() {
          const running = yield* guarded("running", repairRunningJobsEffect(), {
            stale: 0,
            accessRevoked: 0,
          });
          const stuckPlaybooks = yield* guarded(
            "playbook_advance",
            reconcileStuckPlaybookRunsEffect(),
            0
          );
          const orphanedQueued = yield* guarded(
            "orphan_queued",
            reconcileOrphanedQueuedJobsEffect(),
            0
          );
          return {
            ran: true,
            ...running,
            stuckPlaybooks,
            orphanedQueued,
          };
        })
      );
    })
  );
}
