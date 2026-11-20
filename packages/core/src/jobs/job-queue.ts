import { Context, Effect, Layer, Semaphore } from "effect";
import { PgBoss, type Db as BossDb } from "pg-boss";

import { JOB_LANES, type JobLane } from "@watchdog/caps/sdk";
import { env } from "@watchdog/env/server";

import { InternalError } from "../errors/tagged-errors";
import { logProcessWarning, logSwallowed } from "../infra/process-log";
import {
  JobQueueWorker,
  queueAbortOf,
  type QueueWorkHandler,
  type QueueWorkOptions,
} from "./job-queue-worker";
import { laneQueueName } from "./lanes";
import { queueExpireSeconds, gracefulStopTimeoutMs } from "./timeouts";

export {
  JobQueueWorker,
  queueAbortOf,
  type QueuedJob,
} from "./job-queue-worker";

/** pg-boss queue of the quick lane (see `laneQueueName`). */
export const CAP_JOB_QUEUE = laneQueueName("quick");

export type CapJobPayload = {
  jobId: string;
};

export type BossRole = "producer" | "worker";

/**
 * The producing transaction as pg-boss runs SQL on it (`jobQueueTx(tx)` from `@watchdog/db`):
 * a send inserts its delivery there, so it commits or rolls back with the Job row (#721).
 */
export type QueueTx = BossDb;

const QUEUE_RETRY_LIMIT = 1;
const QUEUE_HEARTBEAT_SECONDS = 60;
/**
 * How often a worker refreshes the heartbeat of each delivery it runs. The refresh is fenced to
 * the worker's claim, so it is also how a cancel reaches a running attempt: the first refresh
 * after the cancel commits finds the delivery gone and aborts `job.signal` (#722). One small
 * UPDATE per running delivery per refresh.
 */
const QUEUE_HEARTBEAT_REFRESH_SECONDS = 2;
const QUEUE_WARNING_SIZE = 100;
/** A producer holds no handlers to drain: only in-flight sends settle. */
const PRODUCER_STOP_TIMEOUT_MS = 5000;

export type QueueSendOptions = {
  /** The lane (queue) the delivery goes to. */
  readonly lane: JobLane;
  readonly expireInSeconds: number;
  readonly singletonKey: string;
};

/** A pending delivery to cancel: its pg-boss id and queue (`listPendingJobDeliveries`). */
export type QueueDelivery = {
  readonly id: string;
  readonly queue: string;
};

export type BossStopOptions = {
  readonly graceful: boolean;
  readonly timeout: number;
};

/**
 * The slice of pg-boss the service uses. The live Layers build it from
 * `PgBoss`; tests pass a fake through `makeJobQueueLayers`.
 */
export type BossDriver = {
  readonly start: () => Promise<unknown>;
  readonly stop: (options: BossStopOptions) => Promise<unknown>;
  /** Create (if missing) and update every lane's queue with the shared options. */
  readonly ensureQueue: () => Promise<unknown>;
  /** Insert one delivery on `tx` (pg-boss's `db` send option), never on the boss's own pool. */
  readonly send: (
    tx: QueueTx,
    payload: CapJobPayload,
    options: QueueSendOptions
  ) => Promise<unknown>;
  /** Cancel deliveries of one queue on `tx` (pg-boss's `db` option), with the cancel's own write. */
  readonly cancel: (
    tx: QueueTx,
    queue: string,
    ids: readonly string[]
  ) => Promise<unknown>;
  readonly work: (
    options: QueueWorkOptions,
    handler: QueueWorkHandler
  ) => Promise<unknown>;
};

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

/**
 * The real driver over pg-boss. Producer: no supervise. Worker: supervise. Neither installs or
 * upgrades pg-boss's schema (`migrate: false`): the migrator does that as the owner role
 * (`installJobQueueSchema` in @watchdog/db), so the application role never needs DDL. A database
 * the migrator has not reached fails at start with pg-boss's "not installed" error.
 */
function pgBossDriver(role: BossRole): BossDriver {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: role === "producer" ? "watchdog-web" : "watchdog-worker",
    supervise: role === "worker",
    schedule: false,
    migrate: false,
    // Warnings (handler overrun, backlog, slow query, ...) also land in the
    // `pgboss.warning` table, so an operator still sees them after the log rolled.
    persistWarnings: true,
  });
  boss.on("error", (err) => {
    logSwallowed(`pg-boss:${role}`, err);
  });
  boss.on("warning", (warn) => {
    logProcessWarning(`pg-boss:${role}`, warn.message, { data: warn.data });
  });
  // Set before `boss.stop`. A reasonless abort while stopping is the stop giving up only before
  // the attempt's own expiry (`queueAbortOf`); past it, it stays an expiry.
  let stopping = false;
  return {
    start: () => boss.start(),
    stop: (options) => {
      stopping = true;
      return boss.stop(options);
    },
    ensureQueue: () => {
      const opts = queueOptions();
      const ensure = (name: string) =>
        boss
          .getQueue(name)
          .then((existing) =>
            existing ? undefined : boss.createQueue(name, opts)
          )
          .then(() => boss.updateQueue(name, opts));
      return Promise.all(JOB_LANES.map((lane) => ensure(laneQueueName(lane))));
    },
    send: (tx, payload, { lane, ...options }) =>
      boss.send(laneQueueName(lane), payload, { ...options, db: tx }),
    cancel: (tx, queue, ids) => boss.cancel(queue, [...ids], { db: tx }),
    work: ({ lane, ...options }, handler) =>
      boss.work(
        laneQueueName(lane),
        {
          ...options,
          heartbeatRefreshSeconds: QUEUE_HEARTBEAT_REFRESH_SECONDS,
        },
        (jobs) => {
          const startedAt = Date.now();
          return handler(
            jobs.map((job) => ({
              id: job.id,
              data: job.data,
              expireInSeconds: job.expireInSeconds,
              signal: job.signal,
              abortReason: () =>
                queueAbortOf(job.signal.reason, {
                  stopping,
                  pastExpiry:
                    Date.now() - startedAt >= job.expireInSeconds * 1000,
                }),
            }))
          );
        }
      ),
  };
}

export type JobQueueApi = {
  readonly role: BossRole;
  /**
   * Send one Cap Job delivery inside the producing transaction `tx`; fails with
   * `InternalError` after the scope closed.
   */
  readonly send: (
    tx: QueueTx,
    payload: CapJobPayload,
    options: QueueSendOptions
  ) => Effect.Effect<void, InternalError>;
  /**
   * Cancel pending deliveries inside the cancelling transaction `tx` (#722): a rollback leaves
   * them pending. A running attempt learns of it on its next heartbeat refresh, which aborts its
   * `job.signal`. Fails with `InternalError` after the scope closed.
   */
  readonly cancel: (
    tx: QueueTx,
    deliveries: readonly QueueDelivery[]
  ) => Effect.Effect<void, InternalError>;
};

/**
 * The Cap Job queue as an Effect service (ADR-0002 phase 3): enqueue is
 * `R = JobQueue`. A process composes exactly one role Layer, and each acquires
 * pg-boss in the Layer's Scope and releases it when the scope closes, so there
 * is no module-level boss.
 */
export class JobQueue extends Context.Service<JobQueue, JobQueueApi>()(
  "@watchdog/core/jobs/JobQueue"
) {}

function closedError(): InternalError {
  return new InternalError({ reason: "job queue is closed" });
}

function sendThrough(
  driver: BossDriver,
  isOpen: () => boolean,
  beforeSend: Effect.Effect<void, InternalError>
): JobQueueApi["send"] {
  return (tx, payload, options) =>
    Effect.gen(function* sendGen() {
      if (!isOpen()) return yield* closedError();
      yield* beforeSend;
      yield* Effect.tryPromise({
        try: () => driver.send(tx, payload, options),
        catch: mapBossCatch,
      });
    });
}

function cancelThrough(
  driver: BossDriver,
  isOpen: () => boolean,
  beforeCancel: Effect.Effect<void, InternalError>
): JobQueueApi["cancel"] {
  return (tx, deliveries) =>
    Effect.gen(function* cancelGen() {
      if (deliveries.length === 0) return;
      if (!isOpen()) return yield* closedError();
      yield* beforeCancel;
      const byQueue = new Map<string, string[]>();
      for (const delivery of deliveries) {
        const ids = byQueue.get(delivery.queue) ?? [];
        ids.push(delivery.id);
        byQueue.set(delivery.queue, ids);
      }
      // One transaction: its statements run one after another.
      for (const [queue, ids] of byQueue) {
        yield* Effect.tryPromise({
          try: () => driver.cancel(tx, queue, ids),
          catch: mapBossCatch,
        });
      }
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
        cancel: cancelThrough(driver, () => state.open, ensureStarted),
      });
    })
  );

  const workerLayer = Layer.effectContext(
    Effect.gen(function* workerQueueGen() {
      const driver = createDriver();
      const state = { open: true };
      yield* Effect.acquireRelease(startAndEnsure(driver), () =>
        Effect.gen(function* releaseWorkerGen() {
          // Sends stay open while draining: an in-flight Cap Job may still
          // enqueue its playbook successor, as it could with the old boss.
          const bossStopError = yield* stopEffect(driver, {
            graceful: true,
            timeout: gracefulStopTimeoutMs(),
          });
          state.open = false;
          if (bossStopError !== undefined) {
            yield* Effect.sync(() => {
              logSwallowed("worker.shutdown", new Error(bossStopError));
            });
          }
        })
      );
      const queue = JobQueue.of({
        role: "worker",
        send: sendThrough(driver, () => state.open, Effect.void),
        cancel: cancelThrough(driver, () => state.open, Effect.void),
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
export type RecordedSend = {
  readonly payload: CapJobPayload;
  readonly options: QueueSendOptions;
};

/**
 * Test Layer: a `JobQueue` that records sends and cancels instead of reaching pg-boss.
 * `runDomainWith(Layer.mergeAll(Db.layer, queue.layer))(effect)`.
 */
export function recordingJobQueue(): {
  readonly layer: Layer.Layer<JobQueue>;
  readonly sends: RecordedSend[];
  readonly cancels: QueueDelivery[];
} {
  const sends: RecordedSend[] = [];
  const cancels: QueueDelivery[] = [];
  const layer = Layer.succeed(
    JobQueue,
    JobQueue.of({
      role: "producer",
      send: (_tx, payload, options) =>
        Effect.sync(() => {
          sends.push({ payload, options });
        }),
      cancel: (_tx, deliveries) =>
        Effect.sync(() => {
          cancels.push(...deliveries);
        }),
    })
  );
  return { layer, sends, cancels };
}
