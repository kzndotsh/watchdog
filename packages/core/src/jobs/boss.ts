import { PgBoss } from "pg-boss";

import { env } from "@watchdog/env/server";

import { logProcess, logSwallowed } from "../infra/process-log";
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

async function ensureCapQueue(boss: PgBoss): Promise<void> {
  const opts = queueOptions();
  const existing = await boss.getQueue(CAP_JOB_QUEUE);
  if (!existing) {
    await boss.createQueue(CAP_JOB_QUEUE, opts);
  }
  await boss.updateQueue(CAP_JOB_QUEUE, opts);
}

/**
 * One boss per process. Role is chosen at first start; a second role throws.
 * Producer (web/API): migrate, no supervise. Worker: supervise + migrate.
 */
async function startBoss(role: BossRole): Promise<PgBoss> {
  if (bossSingleton) {
    if (bossRole !== role) {
      throw new Error(
        `pg-boss already started as ${bossRole}; cannot start as ${role}`
      );
    }
    return bossSingleton;
  }

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    application_name: role === "producer" ? "watchdog-web" : "watchdog-worker",
    supervise: role === "worker",
    schedule: false,
    migrate: true,
  });
  attachBossListeners(boss, role);
  await boss.start();
  await ensureCapQueue(boss);
  bossSingleton = boss;
  bossRole = role;
  return boss;
}

/** Web/API enqueue — no supervise / schedule loops. Starts pg-boss on first call. */
export async function ensureBossProducer(): Promise<PgBoss> {
  return await startBoss("producer");
}

/** Worker — supervises heartbeats / expire / maintenance. Starts pg-boss on first call. */
export async function ensureBossWorker(): Promise<PgBoss> {
  return await startBoss("worker");
}

/** Prefer the live boss (worker in-process) so playbook chain does not spawn a second pool. */
async function bossForEnqueue(): Promise<PgBoss> {
  if (bossSingleton) return bossSingleton;
  return await startBoss("producer");
}

/** Single enqueue path — Cap-derived expire, one boss per process. */
export async function enqueueCapJob(
  jobId: string,
  capabilityId: string
): Promise<void> {
  const boss = await bossForEnqueue();
  const payload: CapJobPayload = { jobId };
  await boss.send(CAP_JOB_QUEUE, payload, {
    expireInSeconds: capExpireSeconds(capabilityId),
  });
}
