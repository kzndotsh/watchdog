import path from "node:path";

import { Cause, Data, Effect, Stream } from "effect";

import {
  CAP_JOB_QUEUE,
  executeJobOnMap,
  ensureBossWorkerEffect,
  gracefulStopTimeoutMs,
  isCapJobPayload,
  isWatchdogEvent,
  listenForEventsStream,
  JobFibers,
  type JobFibersApi,
  reconcileStaleJobsEffect,
  reconcileStuckPlaybookRunsEffect,
  type CapJobPayload,
  type JobRunOutcome,
  type BossHandle,
} from "@watchdog/core/worker";
import {
  createLogger,
  initWatchdogLogger,
  jobWideEventFields,
} from "@watchdog/log";

import { cancelPollLoopEffect } from "./cancel-poll";
import { handleExportEventEffect } from "./export-events";

type BossWorker = BossHandle;

interface WorkerResources {
  boss: BossWorker;
}

interface WorkerShutdownContext extends WorkerResources {
  shuttingDown: boolean;
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
    const stale = yield* reconcileStaleJobsEffect();
    if (stale > 0) {
      emitOnce("worker.reconcile", {
        message: `reconciled ${stale} stale running Job(s)`,
        stale,
      });
    }

    const stuckPlaybooks = yield* reconcileStuckPlaybookRunsEffect();
    if (stuckPlaybooks > 0) {
      emitOnce("worker.reconcile", {
        message: `reconciled ${stuckPlaybooks} stuck playbook run(s)`,
        stuckPlaybooks,
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
  return runJob(data.jobId).pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => {
        log.set(
          jobWideEventFields({
            jobId: data.jobId,
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
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        const error = Cause.squash(cause);
        log.set(
          jobWideEventFields({
            jobId: data.jobId,
            outcome: "handler_error",
          })
        );
        log.error(error instanceof Error ? error : new Error(String(error)));
      })
    ),
    Effect.asVoid
  );
}

function processCapJobEffect(
  job: { id: string; data: unknown },
  runJob: RunJob
): Effect.Effect<void, never, JobFibers> {
  const log = createLogger({
    scope: "cap.job",
    bossJobId: job.id,
  });
  const finish = Effect.sync(() => {
    void log.emit();
  });

  if (!isCapJobPayload(job.data)) {
    return Effect.sync(() => {
      log.set({
        job: { outcome: "invalid_payload" },
        error: { message: "missing jobId in payload" },
        payloadType: job.data === null ? "null" : typeof job.data,
      });
    }).pipe(Effect.andThen(finish));
  }

  return executeCapJobPayloadEffect(job.data, log, runJob).pipe(
    Effect.ensuring(finish)
  );
}

function handleExportEventPayloadEffect(
  rawPayload: string
): Effect.Effect<void> {
  return Effect.try({
    try: () => JSON.parse(rawPayload) as unknown,
    catch: (error) => {
      logWorkerError(
        "export-sync.listen",
        "malformed watchdog_events payload",
        error
      );
      return new Error("malformed watchdog_events payload");
    },
  }).pipe(
    Effect.flatMap((parsed) =>
      isWatchdogEvent(parsed) ? handleExportEventEffect(parsed) : Effect.void
    ),
    Effect.ignore
  );
}

function onExportEventListening(): void {
  emitOnce("export-sync", { message: "listening for graph events" });
}

function onExportEventListenError(error: unknown): void {
  logWorkerError("export-sync.listen", "LISTEN connection failed", error);
}

function exportEventsProgram() {
  return Stream.runForEach(
    listenForEventsStream({
      onReady: onExportEventListening,
      onError: onExportEventListenError,
    }),
    (payload) => handleExportEventPayloadEffect(payload)
  );
}

class WorkerShutdownFailed extends Data.TaggedError("WorkerShutdownFailed")<{
  readonly cause: unknown;
}> {}

function shutdownErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function shutdownWorkerResourcesEffect(
  signal: string,
  resources: WorkerResources
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
      catch: (cause) => new WorkerShutdownFailed({ cause }),
    }).pipe(
      Effect.catchTag("WorkerShutdownFailed", (error) =>
        Effect.sync(() => {
          fields.bossStopError = shutdownErrorMessage(error.cause);
        })
      )
    );
    yield* Effect.sync(() => {
      emitOnce("worker.shutdown", fields);
    });
  });
}

function workerShutdownEffect(
  signal: string,
  ctx: WorkerShutdownContext
): Effect.Effect<void> {
  if (ctx.shuttingDown) return Effect.void;
  ctx.shuttingDown = true;
  return shutdownWorkerResourcesEffect(signal, ctx).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exit(0);
      })
    )
  );
}

function onWorkerSignal(signal: string, ctx: WorkerShutdownContext): void {
  Effect.runFork(workerShutdownEffect(signal, ctx));
}

function bindWorkerShutdown(boss: BossWorker): void {
  const ctx: WorkerShutdownContext = {
    boss,
    shuttingDown: false,
  };
  process.on("SIGTERM", () => {
    onWorkerSignal("SIGTERM", ctx);
  });
  process.on("SIGINT", () => {
    onWorkerSignal("SIGINT", ctx);
  });
}

function processCapJobBatchEffect(
  jobs: { id: string; data: unknown }[],
  runJob: RunJob
): Effect.Effect<void, never, JobFibers> {
  const job = jobs[0];
  if (!job) return Effect.void;
  return processCapJobEffect(job, runJob);
}

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
            (jobs) =>
              Effect.runPromise(
                processCapJobBatchEffect(jobs, runJob).pipe(
                  Effect.provideService(JobFibers, fibers)
                )
              )
          )
        ),
      catch: (error) =>
        new Error(error instanceof Error ? error.message : String(error)),
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
    const resources = yield* Effect.acquireRelease(
      startWorkerResourcesEffect(fibers, (jobId) => executeJobOnMap(jobId)),
      (acquired) => shutdownWorkerResourcesEffect("interrupt", acquired)
    );
    yield* Effect.sync(() => {
      bindWorkerShutdown(resources.boss);
    });
    yield* cancelPollLoopEffect.pipe(Effect.forkChild);
    return yield* exportEventsProgram();
  })
);
