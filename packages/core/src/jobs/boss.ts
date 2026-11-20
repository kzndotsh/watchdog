import { Effect } from "effect";

import { jobQueueTx, type DbTx } from "@watchdog/db";
import { parseTrimmedUuid } from "@watchdog/schemas/shared";

import type { InternalError } from "../errors/tagged-errors";
import { InvalidError } from "../errors/tagged-errors";
import { JobQueue, type CapJobPayload } from "./job-queue";
import { jobLane } from "./lanes";
import { capExpireSeconds } from "./timeouts";

export { CAP_JOB_QUEUE, type CapJobPayload } from "./job-queue";

export function isCapJobPayload(value: unknown): value is CapJobPayload {
  if (typeof value !== "object" || value === null || !("jobId" in value)) {
    return false;
  }
  const jobId = value.jobId;
  if (typeof jobId !== "string") return false;
  return parseTrimmedUuid(jobId) !== null;
}

/**
 * Single enqueue path: Cap-derived expire; the queue comes from the `JobQueue` service. `tx` is
 * the transaction that inserted the Job row: the delivery commits with it, so a Job is queued
 * exactly when it is saved, and a rollback leaves neither (#721).
 */
export function enqueueCapJobEffect(
  tx: DbTx,
  jobId: string,
  capabilityId: string
): Effect.Effect<void, InternalError | InvalidError, JobQueue> {
  return Effect.gen(function* enqueueCapJobGen() {
    const normalizedJobId = parseTrimmedUuid(jobId) ?? undefined;
    if (normalizedJobId === undefined) {
      return yield* new InvalidError({ reason: "Job id must not be blank" });
    }
    const queue = yield* JobQueue;
    yield* queue.send(
      jobQueueTx(tx),
      { jobId: normalizedJobId },
      {
        lane: jobLane(capabilityId),
        expireInSeconds: capExpireSeconds(capabilityId),
        singletonKey: normalizedJobId,
      }
    );
  });
}
