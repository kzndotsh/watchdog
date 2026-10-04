import { Effect } from "effect";

import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

import type { InternalError } from "../infra/tagged-errors";
import { InvalidError } from "../infra/tagged-errors";
import { JobQueue, type CapJobPayload } from "./job-queue";
import { capExpireSeconds } from "./timeouts";

export { CAP_JOB_QUEUE, type CapJobPayload } from "./job-queue";

export function isCapJobPayload(value: unknown): value is CapJobPayload {
  if (typeof value !== "object" || value === null || !("jobId" in value)) {
    return false;
  }
  const jobId = value.jobId;
  if (typeof jobId !== "string") return false;
  return parseTrimmedCaseId(jobId) !== null;
}

/** Single enqueue path: Cap-derived expire; the queue comes from the `JobQueue` service. */
export function enqueueCapJobEffect(
  jobId: string,
  capabilityId: string
): Effect.Effect<void, InternalError | InvalidError, JobQueue> {
  return Effect.gen(function* enqueueCapJobGen() {
    const normalizedJobId = parseTrimmedCaseId(jobId) ?? undefined;
    if (normalizedJobId === undefined) {
      return yield* new InvalidError({ reason: "Job id must not be blank" });
    }
    const queue = yield* JobQueue;
    yield* queue.send(
      { jobId: normalizedJobId },
      {
        expireInSeconds: capExpireSeconds(capabilityId),
        singletonKey: normalizedJobId,
      }
    );
  });
}
