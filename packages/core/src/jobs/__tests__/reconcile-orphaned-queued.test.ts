import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { InternalError } from "../../infra/tagged-errors";
import { JobQueue, recordingJobQueue } from "../job-queue";
import { reconcileOrphanedQueuedJobsEffect } from "../reconcile-stale-jobs";

const JOB_1 = "11111111-1111-4111-8111-000000000001";
const JOB_2 = "22222222-2222-4222-8222-000000000002";

const { listQueuedStale } = vi.hoisted(() => ({
  listQueuedStale: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  jobsRepo: { listQueuedStale },
}));

describe("reconcileOrphanedQueuedJobsEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-enqueues stale queued jobs and returns the success count", async () => {
    listQueuedStale.mockResolvedValue([
      { id: JOB_1, capabilityId: "network.dns.lookup" },
      { id: JOB_2, capabilityId: "network.dns.lookup" },
    ]);
    const queue = recordingJobQueue();

    const count = await runDomainWith(Layer.mergeAll(Db.layer, queue.layer))(
      reconcileOrphanedQueuedJobsEffect()
    );

    expect(count).toBe(2);
    expect(queue.sends.map((s) => s.payload.jobId)).toEqual([JOB_1, JOB_2]);
  });

  it("skips enqueue failures and still counts successes", async () => {
    listQueuedStale.mockResolvedValue([
      { id: JOB_1, capabilityId: "network.dns.lookup" },
      { id: JOB_2, capabilityId: "network.dns.lookup" },
    ]);
    const failingSecond = Layer.succeed(
      JobQueue,
      JobQueue.of({
        role: "producer",
        send: (payload) =>
          payload.jobId === JOB_2
            ? Effect.fail(new InternalError({ reason: "boss unavailable" }))
            : Effect.void,
      })
    );

    const count = await runDomainWith(Layer.mergeAll(Db.layer, failingSecond))(
      reconcileOrphanedQueuedJobsEffect()
    );

    expect(count).toBe(1);
  });
});
