import { Context, Effect, Exit, Layer, Semaphore } from "effect";
import { PgBoss } from "pg-boss";

import { env } from "@watchdog/env/server";

import { logProcess, logSwallowed } from "../infra/process-log";
import { InternalError } from "../infra/tagged-errors";
import {
  JobQueueWorker,
  type QueueWorkHandler,
  type QueueWorkOptions,
} from "./job-queue-worker";
import { queueExpireSeconds, gracefulStopTimeoutMs } from "./timeouts";

export { JobQueueWorker, type QueuedJob } from "./job-queue-worker";

/** pg-boss queue name for Cap Jobs. */
export const CAP_JOB_QUEUE = "watchdog.cap-jobs";

export interface CapJobPayload {
  jobId: string;
}

export type BossRole = "producer" | "worker";

const QUEUE_RETRY_LIMIT = 1;
const QUEUE_HEARTBEAT_SECONDS = 60;
const QUEUE_WARNING_SIZE = 100;
/** A producer holds no handlers to drain: only in-flight sends settle. */
const PRODUCER_STOP_TIMEOUT_MS = 5000;

export interface QueueSendOptions {
  readonly expireInSeconds: number;
  readonly singletonKey: string;
}

export interface BossStopOptions {
  readonly graceful: boolean;
  readonly timeout: number;
}

/**
 * The slice of pg-boss the service uses. The live Layers build it from
 * `PgBoss`; tests pass a fake through `makeJobQueueLayers`.
 */
export interface BossDriver {
  readonly start: () => Promise<unknown>;
  readonly stop: (options: BossStopOptions) => Promise<unknown>;
  /** Create (if missing) and update the Cap queue with the shared options. */
  readonly ensureQueue: () => Promise<unknown>;
  readonly send: (
    payload: CapJobPayload,
    options: QueueSendOptions
  ) => Promise<unknown>;
  readonly work: (
    options: QueueWorkOptions,
    handler: QueueWorkHandler
  ) => Promise<unknown>;
}

/** Driver text stays in `cause` (log-only); the reason is a fixed safe string. */
function mapBossCatch(error: unknown): InternalError {
  return new InternalError({ reason: "pg-boss failed", cause: error });
}

function queueOptions() {
  return {
    retryLimit: QUEUE_RETRY_LIMIT,
    expireInSeconds: queueExpireSeconds(),
    heartbeatSeconds: QUEUE_HEARTBEAT_SECONDS,
    warningQueueSize: QUEUE_WARNING_SIZE,
  };
}

/** The real driver over pg-boss. Producer: migrate, no supervise. Worker: supervise + migrate. */
function pgBossDriver(role: BossRole): BossDriver {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: role === "producer" ? "watchdog-web" : "watchdog-worker",
    supervise: role === "worker",
    schedule: false,
    migrate: true,
  });
  boss.on("error", (err) => {
    logSwallowed(`pg-boss:${role}`, err);
  });
  boss.on("warning", (warn) => {
    logProcess(`pg-boss:${role}`, warn.message, { data: warn.data });
  });
  return {
    start: () => boss.start(),
    stop: (options) => boss.stop(options),
    ensureQueue: () => {
      const opts = queueOptions();
      return boss
        .getQueue(CAP_JOB_QUEUE)
        .then((existing) =>
          existing ? undefined : boss.createQueue(CAP_JOB_QUEUE, opts)
        )
        .then(() => boss.updateQueue(CAP_JOB_QUEUE, opts));
    },
    send: (payload, options) => boss.send(CAP_JOB_QUEUE, payload, options),
    work: (options, handler) => boss.work(CAP_JOB_QUEUE, options, handler),
  };
}

export interface JobQueueApi {
  readonly role: BossRole;
  /** Send one Cap Job delivery; fails with `InternalError` after the scope closed. */
  readonly send: (
    payload: CapJobPayload,
    options: QueueSendOptions
  ) => Effect.Effect<void, InternalError>;
}

/**
 * The Cap Job queue as an Effect service (ADR-0002 phase 3): enqueue is
 * `R = JobQueue`. A process composes exactly one role Layer, and each acquires
 * pg-boss in the Layer's Scope and releases it when the scope closes, so there
 * is no module-level boss.
 */
export class JobQueue extends Context.Service<JobQueue, JobQueueApi>()(
  "@watchdog/core/jobs/JobQueue"
) {}

function exitLabel(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isSuccess(exit)) return "exit";
  return Exit.hasInterrupts(exit) ? "interrupt" : "failure";
}

function closedError(): InternalError {
  return new InternalError({ reason: "job queue is closed" });
}

function sendThrough(
  driver: BossDriver,
  isOpen: () => boolean,
  beforeSend: Effect.Effect<void, InternalError>
): JobQueueApi["send"] {
  return (payload, options) =>
    Effect.gen(function* sendGen() {
      if (!isOpen()) return yield* closedError();
      yield* beforeSend;
      yield* Effect.tryPromise({
        try: () => driver.send(payload, options),
        catch: mapBossCatch,
      });
    });
}

const startAndEnsure = (driver: BossDriver) =>
  Effect.gen(function* startAndEnsureGen() {
    yield* Effect.tryPromise({
      try: () => driver.start(),
      catch: mapBossCatch,
    });
    yield* Effect.tryPromise({
      try: () => driver.ensureQueue(),
      catch: mapBossCatch,
    });
  });

function stopEffect(
  driver: BossDriver,
  options: BossStopOptions
): Effect.Effect<string | undefined> {
  return Effect.tryPromise({
    try: () => driver.stop(options),
    catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
  }).pipe(
    Effect.match({
      onSuccess: (): string | undefined => undefined,
      onFailure: (message) => message,
    })
  );
}

/**
 * Both role Layers over a driver factory (the factory runs when the Layer is
 * built, one driver per build). Exported so tests can pass a fake driver; the
 * live Layers are `jobQueueProducerLayer` / `jobQueueWorkerLayer`.
 */
export function makeJobQueueLayers(createDriver: () => BossDriver) {
  const producerLayer = Layer.effect(
    JobQueue,
    Effect.gen(function* producerQueueGen() {
      const driver = createDriver();
      const gate = yield* Semaphore.make(1);
      // `booted` (start() succeeded) and `queueReady` (queue ensured) are
      // tracked apart: a retry after a failed ensure must not start() again,
      // and release stops any booted boss.
      const state = { booted: false, queueReady: false, open: true };
      // One gate serves start and release. The start runs uninterruptibly
      // inside it, so an interrupted send cannot abandon a half-done start,
      // concurrent and later sends join the single start, and release waits
      // for an in-flight start before it stops the boss.
      yield* Effect.addFinalizer(() => {
        state.open = false;
        return gate.withPermits(1)(
          Effect.gen(function* releaseProducerGen() {
            if (!state.booted) return;
            const error = yield* stopEffect(driver, {
              graceful: true,
              timeout: PRODUCER_STOP_TIMEOUT_MS,
            });
            if (error !== undefined) {
              yield* Effect.sync(() => {
                logSwallowed("pg-boss:producer", new Error(error));
              });
            }
          })
        );
      });
      const ensureStarted = gate.withPermits(1)(
        Effect.uninterruptible(
          Effect.gen(function* ensureStartedGen() {
            if (!state.open) return yield* closedError();
            if (!state.booted) {
              yield* Effect.tryPromise({
                try: () => driver.start(),
                catch: mapBossCatch,
              });
              state.booted = true;
            }
            if (!state.queueReady) {
              yield* Effect.tryPromise({
                try: () => driver.ensureQueue(),
                catch: mapBossCatch,
              });
              state.queueReady = true;
            }
          })
        )
      );
      return JobQueue.of({
        role: "producer",
        send: sendThrough(driver, () => state.open, ensureStarted),
      });
    })
  );

  const workerLayer = Layer.effectContext(
    Effect.gen(function* workerQueueGen() {
      const driver = createDriver();
      const state = { open: true };
      yield* Effect.acquireRelease(startAndEnsure(driver), (_acquired, exit) =>
        Effect.gen(function* releaseWorkerGen() {
          // Sends stay open while draining: an in-flight Cap Job may still
          // enqueue its playbook successor, as it could with the old boss.
          const bossStopError = yield* stopEffect(driver, {
            graceful: true,
            timeout: gracefulStopTimeoutMs(),
          });
          state.open = false;
          const how = exitLabel(exit);
          yield* Effect.sync(() => {
            logProcess(
              "worker.shutdown",
              `shutting down (${how})`,
              bossStopError === undefined ? {} : { bossStopError }
            );
          });
        })
      );
      const queue = JobQueue.of({
        role: "worker",
        send: sendThrough(driver, () => state.open, Effect.void),
      });
      const worker = JobQueueWorker.of({
        work: (options, handler) =>
          state.open
            ? Effect.tryPromise({
                try: () => driver.work(options, handler),
                catch: mapBossCatch,
              }).pipe(Effect.asVoid)
            : Effect.fail(closedError()),
      });
      return Context.make(JobQueue, queue).pipe(
        Context.add(JobQueueWorker, worker)
      );
    })
  );

  return { producerLayer, workerLayer };
}

/**
 * Web/API role. `boss.start()` (migrate) and queue creation run lazily on the
 * first send, and a failed start retries on the next send, so building the
 * Layer never touches the database. Release stops a started boss.
 */
export const jobQueueProducerLayer: Layer.Layer<JobQueue> = makeJobQueueLayers(
  () => pgBossDriver("producer")
).producerLayer;

/**
 * Worker role. Starts pg-boss and ensures the queue when the Layer is built
 * (a failure fails the boot), provides `JobQueue` and `JobQueueWorker`, and
 * releases with a graceful `boss.stop` bounded by `gracefulStopTimeoutMs()`.
 */
export const jobQueueWorkerLayer: Layer.Layer<
  JobQueue | JobQueueWorker,
  InternalError
> = makeJobQueueLayers(() => pgBossDriver("worker")).workerLayer;

/** One recorded `send` of a recording queue. */
export interface RecordedSend {
  readonly payload: CapJobPayload;
  readonly options: QueueSendOptions;
}

/**
 * Test Layer: a `JobQueue` that records sends instead of reaching pg-boss.
 * `runDomainWith(Layer.mergeAll(TestDbLayer, queue.layer))(effect)`.
 */
export function recordingJobQueue(): {
  readonly layer: Layer.Layer<JobQueue>;
  readonly sends: RecordedSend[];
} {
  const sends: RecordedSend[] = [];
  const layer = Layer.succeed(
    JobQueue,
    JobQueue.of({
      role: "producer",
      send: (payload, options) =>
        Effect.sync(() => {
          sends.push({ payload, options });
        }),
    })
  );
  return { layer, sends };
}
