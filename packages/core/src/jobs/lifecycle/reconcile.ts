import { Cause, Clock, Effect } from "effect";

import type { jobsRepo } from "@watchdog/db";
import {
  findCollectQueueDrift,
  listQueuedJobsWithoutDelivery,
  rebuildCollectQueue,
  tryLockJobReconcile,
} from "@watchdog/db";
import { isOpenJobStatus } from "@watchdog/schemas/shared";

import { errorMessage } from "../../errors/error-utils";
import type { DomainTag } from "../../errors/tagged-errors";
import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { inCaseOrganizationIfFound } from "../../infra/organization-scope";
import { tryDb, tryDbWith } from "../../infra/postgres-effect";
import { outsideTransaction, transact } from "../../infra/postgres-tx";
import { logProcessWarning, logSwallowed } from "../../infra/process-log";
import {
  casesRepoFxDb,
  jobsRepoFxDb,
  playbookRunsRepoFxDb,
} from "../../infra/repos-fx";
import { jobAccessLostReasonEffect } from "../job-access";
import type { JobQueue } from "../job-queue";
import { ACT_LOST_MESSAGE, isActJob } from "../lanes";
import { advancePlaybookRunEffect } from "../stages/chain";
import { capExpireSeconds } from "../timeouts";
import { cancelWithin } from "./cancel";
import { settleJobEffect } from "./settle";
import { advancePlaybookTailEffect } from "./tail";

/** How often the worker runs a reconcile tick (the worker schedules it; its loop takes a shorter one in tests). */
export const JOB_RECONCILE_INTERVAL = "60 seconds" as const;

const STALE_ERROR =
  "This Job ran past its Capability time window and no worker finished it";

/** Repairs run a few at a time: the tick's lock transaction already holds one connection. */
const REPAIR_CONCURRENCY = 4;

/** Live Cases whose Collect queue projection one tick counts (a full comparison covers one more). */
const COLLECT_QUEUE_DRIFT_BATCH = 20;

type RunningJobRow = Awaited<ReturnType<typeof jobsRepo.listRunning>>[number];

/** What one {@link reconcileJobsEffect} tick did; `ran` is false when another worker held the lock. */
export type JobReconcileResult = {
  readonly ran: boolean;
  /** Running Jobs failed as stale (past their Cap's window, or of an unknown Cap). */
  readonly stale: number;
  /** Running Jobs cancelled because their creator lost access to the Case. */
  readonly accessRevoked: number;
  /** Queued Jobs failed because their pg-boss delivery ended or is gone (never re-sent). */
  readonly undelivered: number;
  /** Playbook runs with no open Job that were advanced again. */
  readonly stuckPlaybooks: number;
  /** Cases whose Collect queue projection had drifted (or whose flush failed) and was rebuilt. */
  readonly collectQueueRebuilt: number;
};

const SKIPPED: JobReconcileResult = {
  ran: false,
  stale: 0,
  accessRevoked: 0,
  undelivered: 0,
  stuckPlaybooks: 0,
  collectQueueRebuilt: 0,
};

/** The failure text of a queued Job whose delivery ended or is gone before a worker took it. */
const UNDELIVERED_ERROR =
  "This Job's queue delivery ended before a worker started it; start it again";

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
      const staleMessage =
        cap.ok && isActJob(row.capabilityId) ? ACT_LOST_MESSAGE : STALE_ERROR;
      const settled = yield* settleJobEffect(
        target,
        { kind: "fail", cause: cap.ok ? "stale" : "preflight_failed" },
        {
          error: cap.ok
            ? staleMessage
            : `Unknown Capability ${row.capabilityId}: ${cap.message}`,
          logs: [],
          finishedAt,
          // The worker that ran it may have died mid-call: its record can have gaps (a call
          // with a request row and no outcome).
          ...(cap.ok ? { provenanceState: "incomplete" as const } : {}),
        }
      );
      if (settled === null) return "none" as const;
      yield* advancePlaybookTailEffect({
        jobId: row.id,
        caseId: row.caseId,
        playbookRunId: row.playbookRunId,
      });
      return "stale" as const;
    }
    // A deleted Case cancels its own Jobs and is invisible here: only a live Case is rechecked.
    const caseRow = yield* casesRepoFxDb.getByIdUnchecked(row.caseId);
    if (caseRow === null) return "none" as const;
    const accessLost = yield* jobAccessLostReasonEffect(
      row,
      caseRow.organizationId
    );
    if (accessLost === null) return "none" as const;
    // The lifecycle's cancel: its delivery is cancelled in the same transaction, so the
    // attempt (here or in another worker) is aborted by its next heartbeat refresh.
    const outcome = yield* transact((tx) =>
      cancelWithin(
        tx,
        { kind: "job", caseId: row.caseId, jobId: row.id },
        "access_revoked",
        accessLost
      )
    );
    if (outcome.cancelled.length === 0) return "none" as const;
    yield* outcome.afterCommit;
    return "access_revoked" as const;
  });
}

function repairRunningJobsEffect(): Effect.Effect<
  { readonly stale: number; readonly accessRevoked: number },
  DomainTag,
  Db | JobQueue
> {
  return Effect.gen(function* repairRunningJobsGen() {
    const running = yield* jobsRepoFxDb.listRunning();
    const now = yield* Clock.currentTimeMillis;
    const verdicts = yield* Effect.forEach(
      running,
      (row) =>
        inCaseOrganizationIfFound(row.caseId, repairRunningJobEffect(row, now)),
      { concurrency: REPAIR_CONCURRENCY }
    );
    return {
      stale: verdicts.filter((v) => v === "stale").length,
      accessRevoked: verdicts.filter((v) => v === "access_revoked").length,
    };
  });
}

/**
 * Fail every `queued` Job with no pending pg-boss delivery (`listQueuedJobsWithoutDelivery`:
 * its delivery failed for good, completed or was cancelled without the row being claimed, for
 * example after a worker died before its claim, or was deleted by retention). Nothing would
 * ever deliver it again, so it ends `failed` (`orphaned`) instead of sitting queued; it is never
 * re-sent. A settle that moved nothing (a worker claimed it meanwhile) counts nothing.
 */
function failUndeliveredJobsEffect(): Effect.Effect<
  number,
  DomainTag,
  Db | JobQueue
> {
  return Effect.gen(function* failUndeliveredJobsGen() {
    const rows = yield* tryDbWith((exec) =>
      listQueuedJobsWithoutDelivery(exec)
    );
    const failed = yield* Effect.forEach(
      rows,
      (row) =>
        inCaseOrganizationIfFound(
          row.caseId,
          Effect.gen(function* failUndeliveredGen() {
            const finishedAt = yield* nowDateEffect;
            const settled = yield* settleJobEffect(
              { jobId: row.id, caseId: row.caseId },
              { kind: "fail", cause: "orphaned" },
              { error: UNDELIVERED_ERROR, logs: [], finishedAt }
            );
            if (settled === null) return false;
            yield* advancePlaybookTailEffect({
              jobId: row.id,
              caseId: row.caseId,
              playbookRunId: row.playbookRunId,
            });
            return true;
          })
        ),
      { concurrency: REPAIR_CONCURRENCY }
    );
    return failed.filter(Boolean).length;
  });
}

/** Re-advance playbook runs left `running` after a swallowed advance error. */
function reconcileStuckPlaybookRunsEffect(): Effect.Effect<
  number,
  DomainTag,
  Db | JobQueue
> {
  return Effect.gen(function* reconcileStuckPlaybookRunsGen() {
    const running = yield* playbookRunsRepoFxDb.listRunning();
    const results = yield* Effect.forEach(
      running,
      (run) =>
        inCaseOrganizationIfFound(
          run.caseId,
          Effect.gen(function* reconcileOnePlaybookGen() {
            const members = yield* jobsRepoFxDb.listStatusesForPlaybookRun(
              run.id
            );
            if (members.some((m) => isOpenJobStatus(m.status))) return false;
            return yield* advancePlaybookRunEffect({
              playbookRunId: run.id,
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
          })
        ),
      { concurrency: REPAIR_CONCURRENCY }
    );
    return results.filter(Boolean).length;
  });
}

/**
 * Collect's queue (#574) is a projection the database keeps at commit; a flush that failed, or a
 * rule bug, leaves a Case stale. Rebuild every Case the drift check names, each in its own
 * statement (so one Case's lock is held only for its own rebuild), and log why. A Case that
 * fails to rebuild is logged and skipped (it stays drifted for the next tick); the count is of the
 * rebuilds that succeeded.
 */
function repairCollectQueueEffect(): Effect.Effect<number, DomainTag, Db> {
  return Effect.gen(function* repairCollectQueueGen() {
    const drifted = yield* tryDbWith((exec) =>
      findCollectQueueDrift(exec, COLLECT_QUEUE_DRIFT_BATCH)
    );
    let rebuilt = 0;
    for (const { caseId, reason } of drifted) {
      const ok = yield* tryDbWith((exec) =>
        rebuildCollectQueue(exec, caseId)
      ).pipe(
        Effect.as(true),
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            logSwallowed(
              "reconcile.collect_queue_rebuild",
              Cause.squash(cause),
              {
                caseId,
                reason,
              }
            );
            return false;
          })
        )
      );
      if (!ok) continue;
      rebuilt += 1;
      yield* Effect.sync(() => {
        logProcessWarning(
          "collect_queue.drift",
          "rebuilt a Case's Collect queue",
          { caseId, reason }
        );
      });
    }
    return rebuilt;
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
 * to the Case (`access_revoked`), fail queued Jobs whose pg-boss delivery ended or is gone
 * (`orphaned`; the delivery is inserted with the Job row, #721, so nothing is re-sent),
 * re-advance stuck playbook runs and rebuild Cases whose Collect queue projection drifted.
 * Every status change goes through `settleJobEffect`: one guarded write and one
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
          const undelivered = yield* guarded(
            "undelivered",
            failUndeliveredJobsEffect(),
            0
          );
          const stuckPlaybooks = yield* guarded(
            "playbook_advance",
            reconcileStuckPlaybookRunsEffect(),
            0
          );
          const collectQueueRebuilt = yield* guarded(
            "collect_queue",
            repairCollectQueueEffect(),
            0
          );
          return {
            ran: true,
            ...running,
            undelivered,
            stuckPlaybooks,
            collectQueueRebuilt,
          };
        })
      );
    })
  );
}
