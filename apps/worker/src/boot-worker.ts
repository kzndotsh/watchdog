import path from "node:path";

import { Cause, Data, Deferred, Effect } from "effect";

import {
  type JobFibers,
  type JobQueue,
  type BlobStore,
  type Db,
  type Vault,
  CAP_JOB_QUEUE,
  executeJobOnMap,
  extractDomainJobIdFromPayload,
  failInvalidCapDeliveryEffect,
  isCapJobPayload,
  runActivityConsumerEffect,
  claimCaseExportEffect,
  JobQueueWorker,
  reconcileStaleJobsEffect,
  reconcileStuckPlaybookRunsEffect,
  reconcileOrphanedQueuedJobsEffect,
  type CapJobPayload,
  type JobRunOutcome,
} from "@watchdog/core/worker";
import {
  createLogger,
  initWatchdogLogger,
  jobWideEventFields,
} from "@watchdog/log";
import type { ActivityEntry } from "@watchdog/schemas/feed";
import { trimmedUuidSchema, type CaseId } from "@watchdog/schemas/shared";

import { cancelPollLoopEffect } from "./cancel-poll";
import {
  claimExportEntryEffect,
  shouldTriggerCaseExport,
} from "./export-events";
import { WorkerShutdown, type WorkerShutdownApi } from "./shutdown";
import { emitOnce, logWorkerError } from "./worker-log";

function reconcileWorkerStartupEffect(): Effect.Effect<
  void,
  never,
  Db | JobQueue
> {
  return Effect.gen(function* reconcileWorkerStartupGen() {
    const stale = yield* reconcileStaleJobsEffect().pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logWorkerError(
            "worker.reconcile",
            "stale job reconcile failed",
            Cause.squash(cause)
          );
          return 0;
        })
      )
    );
    if (stale > 0) {
      emitOnce("worker.reconcile", {
        message: `reconciled ${stale} stale running Job(s)`,
        stale,
      });
    }

    const stuckPlaybooks = yield* reconcileStuckPlaybookRunsEffect().pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logWorkerError(
            "worker.reconcile",
            "stuck playbook reconcile failed",
            Cause.squash(cause)
          );
          return 0;
        })
      )
    );
    if (stuckPlaybooks > 0) {
      emitOnce("worker.reconcile", {
        message: `reconciled ${stuckPlaybooks} stuck playbook run(s)`,
        stuckPlaybooks,
      });
    }

    const orphanedQueued = yield* reconcileOrphanedQueuedJobsEffect().pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logWorkerError(
            "worker.reconcile",
            "orphaned queued job reconcile failed",
            Cause.squash(cause)
          );
          return 0;
        })
      )
    );
    if (orphanedQueued > 0) {
      emitOnce("worker.reconcile", {
        message: `re-enqueued ${orphanedQueued} orphaned queued Job(s)`,
        orphanedQueued,
      });
    }
  });
}

type WorkerServices = Db | BlobStore | Vault | JobFibers | JobQueue;

type RunJob = (
  jobId: string
) => Effect.Effect<JobRunOutcome, never, WorkerServices>;

function executeCapJobPayloadEffect(
  data: CapJobPayload,
  log: ReturnType<typeof createLogger>,
  runJob: RunJob
): Effect.Effect<void, never, WorkerServices> {
  const jobId = trimmedUuidSchema.parse(data.jobId);
  return runJob(jobId).pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => {
        log.set(
          jobWideEventFields({
            jobId,
            outcome: outcome.outcome,
            stopReason: outcome.stopReason,
            abortReason: outcome.abortReason,
            fromCache: outcome.fromCache,
            reclaim: outcome.reclaim,
            durationMs: outcome.durationMs,
            caseId: outcome.caseId,
            capabilityId: outcome.capabilityId,
            playbookRunId: outcome.playbookRunId,
          })
        );
      })
    ),
    Effect.catchCause((cause) => {
      if (cause.reasons.some(Cause.isDieReason)) {
        return Effect.die(Cause.squash(cause));
      }
      return Effect.sync(() => {
        const error = Cause.squash(cause);
        log.set(
          jobWideEventFields({
            jobId,
            outcome: "handler_error",
          })
        );
        log.error(error instanceof Error ? error : new Error(String(error)));
      });
    }),
    Effect.asVoid
  );
}

function processCapJobEffect(
  job: { id: string; data: unknown },
  runJob: RunJob
): Effect.Effect<void, Error, WorkerServices> {
  const log = createLogger({
    scope: "cap.job",
    bossJobId: job.id,
  });
  const finish = Effect.sync(() => {
    void log.emit();
  });

  if (!isCapJobPayload(job.data)) {
    const domainJobId = extractDomainJobIdFromPayload(job.data);
    return Effect.gen(function* invalidCapPayloadGen() {
      yield* Effect.sync(() => {
        log.set({
          bossJobId: job.id,
          ...jobWideEventFields({
            jobId: domainJobId ?? job.id,
            outcome: "invalid_payload",
          }),
        });
        log.error(
          new Error(
            `missing jobId in payload (payloadType=${job.data === null ? "null" : typeof job.data})`
          )
        );
      });
      if (domainJobId === undefined) {
        return yield* Effect.fail(
          new Error(`unrecoverable cap payload for boss job ${job.id}`)
        );
      }
      return yield* failInvalidCapDeliveryEffect(domainJobId).pipe(
        Effect.orDie
      );
    }).pipe(Effect.andThen(finish));
  }

  return executeCapJobPayloadEffect(job.data, log, runJob).pipe(
    Effect.ensuring(finish)
  );
}

/** Forks only the wait of a claimed export; a failed write is logged, not fatal. */
function forkExportWait(awaitWrite: Effect.Effect<void>) {
  return Effect.forkChild(
    awaitWrite.pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logWorkerError(
            "export-sync",
            "export scheduling failed",
            Cause.squash(cause)
          );
        })
      )
    )
  );
}

/**
 * One activity entry for the export consumer. Entries that do not change an
 * export (Task, Proposal, other Job actions) return at once. The Case is marked
 * dirty (and the write started or joined) in this fiber, then only the wait is
 * forked: a shutdown that interrupts the forked child before its first step can
 * no longer lose the mark. The consumer stores its cursor after this returns.
 */
function handleExportEntryEffect(entry: ActivityEntry): Effect.Effect<void> {
  return Effect.gen(function* handleExportEntryGen() {
    if (!shouldTriggerCaseExport(entry)) return;
    const awaitWrite = yield* claimExportEntryEffect(entry);
    yield* forkExportWait(awaitWrite);
  });
}

/**
 * The consumer's cursor was ahead of the log (a restore or a wiped log), so
 * what changed is unknowable: schedule an export of every Case. Marks are made
 * here, before the consumer stores the new cursor.
 */
function rescanAllCasesEffect(caseIds: readonly CaseId[]): Effect.Effect<void> {
  return Effect.gen(function* rescanAllCasesGen() {
    emitOnce("export-sync", {
      message: `activity cursor ahead of the log: re-exporting ${caseIds.length} Case(s)`,
    });
    for (const caseId of caseIds) {
      const awaitWrite = yield* claimCaseExportEffect(caseId);
      yield* forkExportWait(awaitWrite);
    }
  });
}

export { handleExportEntryEffect, rescanAllCasesEffect };

/** The worker's cursor row in `activity_cursors`. */
const EXPORT_CONSUMER = "worker-export";

function onExportEventListening(): void {
  emitOnce("export-sync", { message: "listening for activity" });
}

function exportEventsEffect(shutdown: WorkerShutdownApi) {
  return Effect.raceFirst(
    runActivityConsumerEffect({
      consumer: EXPORT_CONSUMER,
      handle: handleExportEntryEffect,
      onResync: rescanAllCasesEffect,
      onReady: onExportEventListening,
      onListenError: shutdown.onListenError,
    }),
    Deferred.await(shutdown.listenFailed)
  );
}

class WorkerBossError extends Data.TaggedError("WorkerBossError")<{
  readonly operation: "start";
  readonly cause: unknown;
}> {
  readonly code = "worker_boss" as const;
}

function processCapJobBatchEffect(
  jobs: readonly { id: string; data: unknown }[],
  runJob: RunJob
): Effect.Effect<void, Error, WorkerServices> {
  if (jobs.length === 0) {
    return Effect.sync(() => {
      logWorkerError(
        "cap.job",
        "empty pg-boss batch",
        new Error("expected at least 1 job")
      );
    }).pipe(Effect.andThen(Effect.fail(new Error("empty pg-boss batch"))));
  }
  if (jobs.length > 1) {
    logWorkerError(
      "cap.job",
      "unexpected pg-boss batch size",
      new Error(`expected 1 job, got ${jobs.length}`)
    );
  }
  return Effect.gen(function* processCapJobBatchGen() {
    for (const capJob of jobs) {
      yield* processCapJobEffect(capJob, runJob);
    }
  });
}

export { processCapJobBatchEffect, processCapJobEffect };

function initWorkerLogger(): void {
  const workerRoot = path.resolve(import.meta.dirname, "..");
  initWatchdogLogger({
    service: "watchdog-worker",
    drainDir: path.join(workerRoot, ".evlog", "logs"),
  });
}

/**
 * Register the Cap Job handler on the worker queue. The handler is the one
 * promise bridge (pg-boss calls it with a Promise contract): it runs with the
 * services captured at boot, and the queue Layer's release (`boss.stop`)
 * waits for it to settle.
 */
function registerCapJobHandlerEffect(
  runJob: RunJob
): Effect.Effect<void, never, WorkerServices | JobQueueWorker> {
  return Effect.gen(function* registerCapJobHandlerGen() {
    const worker = yield* JobQueueWorker;
    const services = yield* Effect.context<WorkerServices>();
    const runBatch = Effect.runPromiseWith(services);
    yield* worker
      .work(
        { localConcurrency: 1, pollingIntervalSeconds: 2 },
        async (jobs) => {
          try {
            await runBatch(processCapJobBatchEffect(jobs, runJob));
          } catch (error: unknown) {
            logWorkerError(
              "cap.job.batch",
              "unhandled cap job batch failure",
              error instanceof Error ? error : new Error(String(error))
            );
            throw error;
          }
        }
      )
      .pipe(
        Effect.mapError(
          (cause) => new WorkerBossError({ operation: "start", cause })
        ),
        Effect.orDie
      );
  });
}

/**
 * Worker boot. R carries the worker queue role (`JobQueueWorker`): composing
 * the producer Layer instead is a type error, so a process is one role. The
 * queue is acquired by its Layer (`main.ts`) and released, draining pg-boss,
 * after this scope closes and before `JobFibers` does.
 */
export const bootWorkerEffect = Effect.scoped(
  Effect.gen(function* bootWorkerMain() {
    yield* Effect.sync(() => {
      initWorkerLogger();
    });
    emitOnce("worker.boot", { message: `listening on ${CAP_JOB_QUEUE}` });
    yield* reconcileWorkerStartupEffect();
    yield* registerCapJobHandlerEffect((jobId) => executeJobOnMap(jobId));
    const shutdown = yield* WorkerShutdown;
    yield* cancelPollLoopEffect.pipe(Effect.forkChild);
    return yield* exportEventsEffect(shutdown);
  })
);
