import { Effect } from "effect";
import { PgBoss } from "pg-boss";

import { env } from "@watchdog/env/server";

import { errorMessage } from "../infra/domain-error";
import { logProcess, logSwallowed } from "../infra/process-log";
import { InvalidError } from "../infra/tagged-errors";
import { capExpireSeconds, queueExpireSeconds } from "./timeouts";

/** pg-boss queue name for Cap Jobs. */
export const CAP_JOB_QUEUE = "watchdog.cap-jobs";

export interface CapJobPayload {
  jobId: string;
}

export function isCapJobPayload(value: unknown): value is CapJobPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "jobId" in value &&
    typeof value.jobId === "string" &&
    value.jobId.length > 0
  );
}

export type BossHandle = PgBoss;
export type BossRole = "producer" | "worker";

const QUEUE_RETRY_LIMIT = 1;
const QUEUE_HEARTBEAT_SECONDS = 60;
const QUEUE_WARNING_SIZE = 100;

let bossSingleton: PgBoss | null = null;
let bossRole: BossRole | null = null;

function queueOptions() {
  return {
    retryLimit: QUEUE_RETRY_LIMIT,
    expireInSeconds: queueExpireSeconds(),
    heartbeatSeconds: QUEUE_HEARTBEAT_SECONDS,
    warningQueueSize: QUEUE_WARNING_SIZE,
  };
}

function attachBossListeners(boss: PgBoss, role: BossRole): void {
  boss.on("error", (err) => {
    logSwallowed(`pg-boss:${role}`, err);
  });
  boss.on("warning", (warn) => {
    logProcess(`pg-boss:${role}`, warn.message, { data: warn.data });
  });
}

function mapBossCatch(error: unknown): InvalidError {
  return new InvalidError({
    reason: errorMessage(error, "pg-boss failed"),
  });
}

function ensureCapQueueEffect(boss: PgBoss): Effect.Effect<void, InvalidError> {
  const opts = queueOptions();
  return Effect.gen(function* ensureCapQueueGen() {
    const existing = yield* Effect.tryPromise({
      try: () => boss.getQueue(CAP_JOB_QUEUE),
      catch: mapBossCatch,
    });
    if (!existing) {
      yield* Effect.tryPromise({
        try: () => boss.createQueue(CAP_JOB_QUEUE, opts),
        catch: mapBossCatch,
      });
    }
    yield* Effect.tryPromise({
      try: () => boss.updateQueue(CAP_JOB_QUEUE, opts),
      catch: mapBossCatch,
    });
  });
}

/**
 * One boss per process. Role is chosen at first start; a second role
 * fails with InvalidError. Producer (web/API): migrate, no supervise.
 * Worker: supervise + migrate.
 */
function startBossEffect(role: BossRole): Effect.Effect<PgBoss, InvalidError> {
  return Effect.gen(function* startBossGen() {
    if (bossSingleton) {
      if (bossRole !== role) {
        return yield* new InvalidError({
          reason: `pg-boss already started as ${bossRole}; cannot start as ${role}`,
        });
      }
      return bossSingleton;
    }

    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      application_name:
        role === "producer" ? "watchdog-web" : "watchdog-worker",
      supervise: role === "worker",
      schedule: false,
      migrate: true,
    });
    attachBossListeners(boss, role);
    yield* Effect.tryPromise({
      try: () => boss.start(),
      catch: mapBossCatch,
    });
    yield* ensureCapQueueEffect(boss);
    bossSingleton = boss;
    bossRole = role;
    return boss;
  });
}

function bossForEnqueueEffect(): Effect.Effect<PgBoss, InvalidError> {
  if (bossSingleton) return Effect.succeed(bossSingleton);
  return startBossEffect("producer");
}

/** Single enqueue path — Cap-derived expire, one boss per process. */
export function enqueueCapJobEffect(
  jobId: string,
  capabilityId: string
): Effect.Effect<void, InvalidError> {
  return Effect.gen(function* enqueueCapJobGen() {
    const boss = yield* bossForEnqueueEffect();
    const payload: CapJobPayload = { jobId };
    yield* Effect.tryPromise({
      try: () =>
        boss.send(CAP_JOB_QUEUE, payload, {
          expireInSeconds: capExpireSeconds(capabilityId),
        }),
      catch: mapBossCatch,
    });
  });
}

export function ensureBossProducerEffect(): Effect.Effect<
  PgBoss,
  InvalidError
> {
  return startBossEffect("producer");
}

export function ensureBossWorkerEffect(): Effect.Effect<PgBoss, InvalidError> {
  return startBossEffect("worker");
}
