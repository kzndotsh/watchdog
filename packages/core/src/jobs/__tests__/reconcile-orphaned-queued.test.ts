import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidError } from "../../infra/tagged-errors";
import { reconcileOrphanedQueuedJobsEffect } from "../reconcile-stale-jobs";

const { listQueuedStale, enqueueCapJobEffect } = vi.hoisted(() => ({
  listQueuedStale: vi.fn(),
  enqueueCapJobEffect: vi.fn(),
}));

vi.mock("@watchdog/db", () => ({
  db: {},
  jobsRepo: { listQueuedStale },
}));

vi.mock("../boss", () => ({
  enqueueCapJobEffect: (...args: unknown[]) => enqueueCapJobEffect(...args),
}));

describe("reconcileOrphanedQueuedJobsEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-enqueues stale queued jobs and returns the success count", async () => {
    listQueuedStale.mockResolvedValue([
      { id: "job-1", capabilityId: "network.dns.lookup" },
      { id: "job-2", capabilityId: "url.enrich" },
    ]);
    enqueueCapJobEffect.mockReturnValue(Effect.void);

    const count = await Effect.runPromise(reconcileOrphanedQueuedJobsEffect());

    expect(count).toBe(2);
    expect(enqueueCapJobEffect).toHaveBeenNthCalledWith(
      1,
      "job-1",
      "network.dns.lookup"
    );
    expect(enqueueCapJobEffect).toHaveBeenNthCalledWith(
      2,
      "job-2",
      "url.enrich"
    );
  });

  it("skips enqueue failures and still counts successes", async () => {
    listQueuedStale.mockResolvedValue([
      { id: "job-1", capabilityId: "network.dns.lookup" },
      { id: "job-2", capabilityId: "url.enrich" },
    ]);
    enqueueCapJobEffect
      .mockReturnValueOnce(Effect.void)
      .mockReturnValueOnce(
        Effect.fail(new InvalidError({ reason: "boss unavailable" }))
      );

    const count = await Effect.runPromise(reconcileOrphanedQueuedJobsEffect());

    expect(count).toBe(1);
  });
});
