import path from "node:path";

import {
  CAP_JOB_QUEUE,
  abortActiveJob,
  executeJob,
  findCancelledJobIds,
  ensureBossWorker,
  gracefulStopTimeoutMs,
  isCapJobPayload,
  isWatchdogEvent,
  listenForEvents,
  listActiveJobIds,
  reconcileStaleJobs,
  reconcileStuckPlaybookRuns,
  type CapJobPayload,
} from "@watchdog/core/worker";
import {
  createLogger,
  initWatchdogLogger,
  jobWideEventFields,
} from "@watchdog/log";

import { handleExportEvent } from "./export-events";

type BossWorker = Awaited<ReturnType<typeof ensureBossWorker>>;
type EventListener = Awaited<ReturnType<typeof listenForEvents>>;

interface WorkerShutdownContext {
  boss: BossWorker;
  listener: EventListener;
  cancelPollInterval: ReturnType<typeof setInterval>;
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

async function reconcileWorkerStartup(): Promise<void> {
  const stale = await reconcileStaleJobs();
  if (stale > 0) {
    emitOnce("worker.reconcile", {
      message: `reconciled ${stale} stale running Job(s)`,
      stale,
    });
  }

  const stuckPlaybooks = await reconcileStuckPlaybookRuns();
  if (stuckPlaybooks > 0) {
    emitOnce("worker.reconcile", {
      message: `reconciled ${stuckPlaybooks} stuck playbook run(s)`,
      stuckPlaybooks,
    });
  }
}

async function executeCapJobPayload(
  data: CapJobPayload,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  try {
    const outcome = await executeJob(data.jobId);
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
  } catch (error: unknown) {
    log.set(
      jobWideEventFields({
        jobId: data.jobId,
        outcome: "handler_error",
      })
    );
    log.error(error instanceof Error ? error : new Error(String(error)));
  }
}

function processCapJob(job: { id: string; data: unknown }): Promise<void> {
  const log = createLogger({
    scope: "cap.job",
    bossJobId: job.id,
  });
  const finish = () => {
    void log.emit();
  };

  if (!isCapJobPayload(job.data)) {
    log.set({
      job: { outcome: "invalid_payload" },
      error: { message: "missing jobId in payload" },
      payloadType: job.data === null ? "null" : typeof job.data,
    });
    finish();
    return Promise.resolve();
  }

  return executeCapJobPayload(job.data, log).finally(finish);
}

function onExportEventPayload(rawPayload: string): void {
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (isWatchdogEvent(parsed)) {
      handleExportEvent(parsed);
    }
  } catch (error: unknown) {
    logWorkerError(
      "export-sync.listen",
      "malformed watchdog_events payload",
      error
    );
  }
}

function onExportEventListening(): void {
  emitOnce("export-sync", { message: "listening for graph events" });
}

function onExportEventListenError(error: unknown): void {
  logWorkerError("export-sync.listen", "LISTEN connection failed", error);
}

function createExportEventListener() {
  return listenForEvents(
    onExportEventPayload,
    onExportEventListening,
    onExportEventListenError
  );
}

async function pollCancelledJobs(): Promise<void> {
  const running = listActiveJobIds();
  if (running.length === 0) return;
  try {
    const cancelled = await findCancelledJobIds([...running]);
    for (const id of cancelled) {
      abortActiveJob(id, "cancel");
    }
  } catch (error: unknown) {
    logWorkerError("worker.cancel_poll", "cancel poll failed", error);
  }
}

function onCancelPollTick(): void {
  void pollCancelledJobs();
}

function createCancelPollInterval(): ReturnType<typeof setInterval> {
  return setInterval(onCancelPollTick, 2000);
}

async function workerShutdown(
  signal: string,
  ctx: WorkerShutdownContext
): Promise<void> {
  if (ctx.shuttingDown) return;
  ctx.shuttingDown = true;
  const fields: Record<string, unknown> = {
    message: `shutting down (${signal})`,
  };
  clearInterval(ctx.cancelPollInterval);
  try {
    await ctx.listener.end();
  } catch (error: unknown) {
    fields.listenerEndError =
      error instanceof Error ? error.message : String(error);
  }
  try {
    await ctx.boss.stop({
      graceful: true,
      timeout: gracefulStopTimeoutMs(),
    });
  } catch (error: unknown) {
    fields.bossStopError =
      error instanceof Error ? error.message : String(error);
  }
  emitOnce("worker.shutdown", fields);
  process.exit(0);
}

function onWorkerSignal(signal: string, ctx: WorkerShutdownContext): void {
  void workerShutdown(signal, ctx);
}

function bindWorkerShutdown(
  boss: BossWorker,
  listener: EventListener,
  cancelPollInterval: ReturnType<typeof setInterval>
): void {
  const ctx: WorkerShutdownContext = {
    boss,
    listener,
    cancelPollInterval,
    shuttingDown: false,
  };
  process.on("SIGTERM", () => {
    onWorkerSignal("SIGTERM", ctx);
  });
  process.on("SIGINT", () => {
    onWorkerSignal("SIGINT", ctx);
  });
}

function processCapJobBatch(
  jobs: { id: string; data: unknown }[]
): Promise<void> {
  const job = jobs[0];
  if (!job) return Promise.resolve();
  return processCapJob(job);
}

export async function bootWorker() {
  const workerRoot = path.resolve(import.meta.dirname, "..");
  initWatchdogLogger({
    service: "watchdog-worker",
    drainDir: path.join(workerRoot, ".evlog", "logs"),
  });

  const boss = await ensureBossWorker();
  emitOnce("worker.boot", { message: `listening on ${CAP_JOB_QUEUE}` });

  await reconcileWorkerStartup();

  await boss.work(
    CAP_JOB_QUEUE,
    { localConcurrency: 1, pollingIntervalSeconds: 2 },
    processCapJobBatch
  );

  const listener = createExportEventListener();
  const cancelPollInterval = createCancelPollInterval();
  bindWorkerShutdown(boss, listener, cancelPollInterval);
}
