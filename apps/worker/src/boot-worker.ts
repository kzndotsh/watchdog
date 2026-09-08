import path from "node:path";

import { Cause, Data, Deferred, Effect, Stream } from "effect";

import {
  CAP_JOB_QUEUE,
  executeJobOnMap,
  ensureBossWorkerEffect,
  extractDomainJobIdFromPayload,
  failInvalidCapDeliveryEffect,
  gracefulStopTimeoutMs,
  isCapJobPayload,
  isWatchdogEvent,
  listenForEventsStream,
  JobFibers,
  type JobFibersApi,
  reconcileStaleJobsEffect,
  reconcileStuckPlaybookRunsEffect,
  reconcileOrphanedQueuedJobsEffect,
  type CapJobPayload,
  type JobRunOutcome,
  type BossHandle,
} from "@watchdog/core/worker";
import {
  createLogger,
  initWatchdogLogger,
  jobWideEventFields,
} from "@watchdog/log";
import { trimmedUuidSchema } from "@watchdog/schemas";

import { cancelPollLoopEffect } from "./cancel-poll";
import {
  handleExportEventEffect,
  shouldTriggerCaseExport,
} from "./export-events";

type BossWorker = BossHandle;

interface WorkerResources {
  boss: BossWorker;
}

interface WorkerShutdownContext extends WorkerResources {
  shuttingDown: boolean;
  shutdownSignal: string;
  bossStopError?: string;
}

function emitOnce(scope: string, fields: Record<string, unknown>): void {
  const log = createLogger({ scope });
  log.set(fields);
  void log.emit();
}

function logWorkerError(scope: string, message: string, error: unknown): void {
  const log = createLogger({ scope });
  log.set({ message });
  log.error(error instanceof Error ? error : new Error(String(error)));
  void log.emit();
}

function reconcileWorkerStartupEffect(): Effect.Effect<void> {
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

type RunJob = (jobId: string) => Effect.Effect<JobRunOutcome, never, JobFibers>;

function executeCapJobPayloadEffect(
  data: CapJobPayload,
  log: ReturnType<typeof createLogger>,
  runJob: RunJob
): Effect.Effect<void, never, JobFibers> {
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
): Effect.Effect<void, Error, JobFibers> {
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

function parseWatchdogEventPayload(rawPayload: string): unknown {
  try {
    return JSON.parse(rawPayload) as unknown;
  } catch {
    return undefined;
  }
}

function handleExportEventPayloadEffect(
  rawPayload: string
): Effect.Effect<void> {
  return Effect.gen(function* handleExportEventPayloadGen() {
    const parsed = parseWatchdogEventPayload(rawPayload);
    if (parsed === undefined) {
      logWorkerError(
        "export-sync.listen",
        "malformed watchdog_events payload",
        new Error("invalid JSON")
      );
      return;
    }
    if (!isWatchdogEvent(parsed)) {
      logWorkerError(
        "export-sync.listen",
        "ignored non-watchdog payload",
        new Error("payload failed watchdog event schema")
      );
      return;
    }
    if (!shouldTriggerCaseExport(parsed)) {
      return;
    }
    yield* Effect.forkChild(
      handleExportEventEffect(parsed).pipe(
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
  });
}

export { handleExportEventPayloadEffect };

function onExportEventListening(): void {
  emitOnce("export-sync", { message: "listening for graph events" });
}

function repeatShutdownExitCode(signal: string): number {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 1;
}

function requestWorkerShutdown(
  signal: string,
  ctx: WorkerShutdownContext,
  shutdownGate: Deferred.Deferred<true>
): void {
  if (ctx.shuttingDown) {
    process.exit(repeatShutdownExitCode(signal));
    return;
  }
  ctx.shuttingDown = true;
  ctx.shutdownSignal = signal;
  void (async () => {
    try {
      await Effect.runPromise(Deferred.succeed(shutdownGate, true));
    } catch (error: unknown) {
      logWorkerError(
        "worker.shutdown",
        "shutdown request failed",
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(1);
    }
  })();
}

function onExportEventListenError(
  error: unknown,
  ctx: WorkerShutdownContext,
  shutdownGate: Deferred.Deferred<true>
): void {
  logWorkerError("export-sync.listen", "LISTEN connection failed", error);
  requestWorkerShutdown("LISTEN", ctx, shutdownGate);
}

function exportEventsProgram(
  ctx: WorkerShutdownContext,
  shutdownGate: Deferred.Deferred<true>
) {
  return Effect.race(
    Stream.runForEach(
      listenForEventsStream({
        onReady: onExportEventListening,
        onError: (error) => {
          onExportEventListenError(error, ctx, shutdownGate);
        },
      }),
      (payload) => handleExportEventPayloadEffect(payload)
    ),
    Deferred.await(shutdownGate)
  );
}

class WorkerBossFailed extends Data.TaggedError("WorkerBossFailed")<{
  readonly operation: "shutdown" | "start";
  readonly cause: unknown;
}> {}

function shutdownErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function shutdownWorkerResourcesEffect(
  signal: string,
  resources: WorkerResources,
  ctx?: WorkerShutdownContext
): Effect.Effect<void> {
  return Effect.gen(function* shutdownWorkerResourcesGen() {
    const fields: Record<string, unknown> = {
      message: `shutting down (${signal})`,
    };
    yield* Effect.tryPromise({
      try: () =>
        resources.boss.stop({
          graceful: true,
          timeout: gracefulStopTimeoutMs(),
        }),
      catch: (cause) => new WorkerBossFailed({ operation: "shutdown", cause }),
    }).pipe(
      Effect.catchTag("WorkerBossFailed", (error) =>
        Effect.sync(() => {
          const message = shutdownErrorMessage(error.cause);
          fields.bossStopError = message;
          if (ctx !== undefined) {
            ctx.bossStopError = message;
          }
        })
      )
    );
    yield* Effect.sync(() => {
      emitOnce("worker.shutdown", fields);
    });
  });
}

function bindWorkerShutdown(
  ctx: WorkerShutdownContext,
  shutdownGate: Deferred.Deferred<true>
): void {
  process.on("SIGTERM", () => {
    requestWorkerShutdown("SIGTERM", ctx, shutdownGate);
  });
  process.on("SIGINT", () => {
    requestWorkerShutdown("SIGINT", ctx, shutdownGate);
  });
}

function processCapJobBatchEffect(
  jobs: { id: string; data: unknown }[],
  runJob: RunJob
): Effect.Effect<void, Error, JobFibers> {
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

function startWorkerResourcesEffect(
  fibers: JobFibersApi,
  runJob: RunJob
): Effect.Effect<WorkerResources> {
  return Effect.gen(function* startWorkerResourcesGen() {
    const boss = yield* ensureBossWorkerEffect().pipe(Effect.orDie);
    emitOnce("worker.boot", { message: `listening on ${CAP_JOB_QUEUE}` });
    yield* reconcileWorkerStartupEffect();

    yield* Effect.tryPromise({
      try: () =>
        Promise.resolve(
          boss.work(
            CAP_JOB_QUEUE,
            { localConcurrency: 1, pollingIntervalSeconds: 2 },
            async (jobs) => {
              try {
                await Effect.runPromise(
                  processCapJobBatchEffect(jobs, runJob).pipe(
                    Effect.provideService(JobFibers, fibers)
                  )
                );
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
        ),
      catch: (cause) => new WorkerBossFailed({ operation: "start", cause }),
    }).pipe(Effect.orDie);

    return { boss };
  });
}

export const bootWorkerEffect = Effect.scoped(
  Effect.gen(function* bootWorkerMain() {
    yield* Effect.sync(() => {
      initWorkerLogger();
    });
    const fibers = yield* JobFibers;
    const shutdownGate = yield* Deferred.make<true>();
    const shutdownCtxHolder: { current?: WorkerShutdownContext } = {};
    const resources = yield* Effect.acquireRelease(
      startWorkerResourcesEffect(fibers, (jobId) => executeJobOnMap(jobId)),
      (acquired) => {
        const ctx = shutdownCtxHolder.current;
        if (ctx === undefined) {
          return shutdownWorkerResourcesEffect("interrupt", acquired);
        }
        return shutdownWorkerResourcesEffect(ctx.shutdownSignal, acquired, ctx);
      }
    );
    const shutdownCtx: WorkerShutdownContext = {
      boss: resources.boss,
      shuttingDown: false,
      shutdownSignal: "interrupt",
    };
    shutdownCtxHolder.current = shutdownCtx;
    yield* Effect.sync(() => {
      bindWorkerShutdown(shutdownCtx, shutdownGate);
    });
    yield* cancelPollLoopEffect.pipe(Effect.forkChild);
    return yield* exportEventsProgram(shutdownCtx, shutdownGate);
  })
);
