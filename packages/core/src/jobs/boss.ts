import { Effect } from "effect";
import { PgBoss } from "pg-boss";

import { env } from "@watchdog/env/server";
import { parseTrimmedCaseId } from "@watchdog/schemas";

import { logProcess, logSwallowed } from "../infra/process-log";
import { InternalError, InvalidError } from "../infra/tagged-errors";
import { capExpireSeconds, queueExpireSeconds } from "./timeouts";

/** pg-boss queue name for Cap Jobs. */
export const CAP_JOB_QUEUE = "watchdog.cap-jobs";

export interface CapJobPayload {
  jobId: string;
}

export function isCapJobPayload(value: unknown): value is CapJobPayload {
  if (typeof value !== "object" || value === null || !("jobId" in value)) {
    return false;
  }
  const jobId = value.jobId;
  if (typeof jobId !== "string") return false;
  return parseTrimmedCaseId(jobId) !== null;
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

/** Driver text stays in `cause` (log-only); the reason is a fixed safe string. */
function mapBossCatch(error: unknown): InternalError {
  return new InternalError({ reason: "pg-boss failed", cause: error });
}

function ensureCapQueueEffect(
  boss: PgBoss
): Effect.Effect<void, InternalError> {
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
 * fails with InternalError. Producer (web/API): migrate, no supervise.
 * Worker: supervise + migrate.
 */
function startBossEffect(role: BossRole): Effect.Effect<PgBoss, InternalError> {
  return Effect.gen(function* startBossGen() {
    if (bossSingleton) {
      if (bossRole !== role) {
        return yield* new InternalError({
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

function bossForEnqueueEffect(): Effect.Effect<PgBoss, InternalError> {
  if (bossSingleton) return Effect.succeed(bossSingleton);
  return startBossEffect("producer");
}

/** Single enqueue path — Cap-derived expire, one boss per process. */
export function enqueueCapJobEffect(
  jobId: string,
  capabilityId: string
): Effect.Effect<void, InternalError | InvalidError> {
  return Effect.gen(function* enqueueCapJobGen() {
    const normalizedJobId = parseTrimmedCaseId(jobId) ?? undefined;
    if (normalizedJobId === undefined) {
      return yield* new InvalidError({ reason: "Job id must not be blank" });
    }
    const boss = yield* bossForEnqueueEffect();
    const payload: CapJobPayload = { jobId: normalizedJobId };
    yield* Effect.tryPromise({
      try: () =>
        boss.send(CAP_JOB_QUEUE, payload, {
          expireInSeconds: capExpireSeconds(capabilityId),
          singletonKey: normalizedJobId,
        }),
      catch: mapBossCatch,
    });
  });
}

export function ensureBossProducerEffect(): Effect.Effect<
  PgBoss,
  InternalError
> {
  return startBossEffect("producer");
}

export function ensureBossWorkerEffect(): Effect.Effect<PgBoss, InternalError> {
  return startBossEffect("worker");
}
