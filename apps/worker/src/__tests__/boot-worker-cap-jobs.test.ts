import { Effect, Fiber, FiberMap, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

const { failInvalidCapDeliveryEffect, forcePayloadValid } = vi.hoisted(() => ({
  failInvalidCapDeliveryEffect: vi.fn(() => Effect.void),
  forcePayloadValid: { on: false },
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    failInvalidCapDeliveryEffect,
    isCapJobPayload: (value: unknown) =>
      forcePayloadValid.on || actual.isCapJobPayload(value),
  };
});

import {
  Db,
  JobFibers,
  recordingJobQueue,
  recordingBlobStore,
  fakeVault,
  type QueuedJob,
} from "@watchdog/core/worker";
import { outboundClientLayer } from "@watchdog/tools/http";

import { processCapJobBatchEffect, processCapJobEffect } from "../boot-worker";

const workerTestServices = Layer.mergeAll(
  Db.layer,
  recordingBlobStore().layer,
  fakeVault().layer,
  outboundClientLayer
);

function queuedJob(id: string, data: unknown): QueuedJob {
  return {
    id,
    data,
    expireInSeconds: 60,
    signal: new AbortController().signal,
  };
}

describe("processCapJobEffect", () => {
  beforeEach(() => {
    failInvalidCapDeliveryEffect.mockClear();
    failInvalidCapDeliveryEffect.mockReturnValue(Effect.void);
  });

  it("does not run jobs for invalid payloads", async () => {
    const runJob = vi.fn(() =>
      Effect.succeed({ outcome: "succeeded" as const, durationMs: 1 })
    );

    await expect(
      Effect.runPromise(
        processCapJobEffect(queuedJob("boss-1", null), runJob).pipe(
          Effect.provide(JobFibers.layer),
          Effect.provide(workerTestServices),
          Effect.provide(recordingJobQueue().layer)
        )
      )
    ).rejects.toThrow(/unrecoverable cap payload/);

    expect(failInvalidCapDeliveryEffect).not.toHaveBeenCalled();
    expect(runJob).not.toHaveBeenCalled();
  });

  it("fails empty pg-boss batches", async () => {
    const runJob = vi.fn(() =>
      Effect.succeed({ outcome: "succeeded" as const, durationMs: 1 })
    );

    await expect(
      Effect.runPromise(
        processCapJobBatchEffect([], runJob).pipe(
          Effect.provide(JobFibers.layer),
          Effect.provide(workerTestServices),
          Effect.provide(recordingJobQueue().layer)
        )
      )
    ).rejects.toThrow(/empty pg-boss batch/);

    expect(runJob).not.toHaveBeenCalled();
  });

  it("processes every job in an oversized pg-boss batch", async () => {
    const runJob = vi.fn((_jobId: string) =>
      Effect.succeed({
        outcome: "succeeded" as const,
        durationMs: 1,
        caseId: testCaseId(1),
        capabilityId: "network.dns.lookup",
        playbookRunId: null,
      })
    );

    await Effect.runPromise(
      processCapJobBatchEffect(
        [
          queuedJob("boss-1", {
            jobId: "00000000-0000-4000-8000-000000000001",
          }),
          queuedJob("boss-2", {
            jobId: "00000000-0000-4000-8000-000000000002",
          }),
        ],
        runJob
      ).pipe(
        Effect.provide(JobFibers.layer),
        Effect.provide(workerTestServices),
        Effect.provide(recordingJobQueue().layer)
      )
    );

    expect(runJob).toHaveBeenCalledTimes(2);
    expect(runJob).toHaveBeenNthCalledWith(
      1,
      "00000000-0000-4000-8000-000000000001"
    );
    expect(runJob).toHaveBeenNthCalledWith(
      2,
      "00000000-0000-4000-8000-000000000002"
    );
  });

  it("trims padded jobId before execution", async () => {
    const runJob = vi.fn((_jobId: string) =>
      Effect.succeed({
        outcome: "succeeded" as const,
        durationMs: 1,
        caseId: testCaseId(1),
        capabilityId: "network.dns.lookup",
        playbookRunId: null,
      })
    );

    await Effect.runPromise(
      processCapJobBatchEffect(
        [
          queuedJob("boss-1", {
            jobId: " 00000000-0000-4000-8000-000000000001 ",
          }),
        ],
        runJob
      ).pipe(
        Effect.provide(JobFibers.layer),
        Effect.provide(workerTestServices),
        Effect.provide(recordingJobQueue().layer)
      )
    );

    expect(runJob).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  });

  it("interrupts the Job fiber when pg-boss aborts the delivery's signal at its expiry", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    const controller = new AbortController();
    const seen: { reason?: string; detail?: string } = {};
    // Stand-in for `executeJobOnMap`: a never-finishing Job fiber in the map.
    const runJob = (id: string) =>
      Effect.gen(function* runHungJobGen() {
        const fibers = yield* JobFibers;
        const fiber = yield* FiberMap.run(fibers.map, id)(Effect.never);
        // pg-boss aborts the signal once the delivery outlives its expiry.
        controller.abort();
        yield* Fiber.await(fiber);
        seen.reason = fibers.peekReason(id);
        seen.detail = fibers.peekDetail(id);
        return { outcome: "failed" as const, durationMs: 1 };
      });

    await Effect.runPromise(
      processCapJobEffect(
        {
          id: "boss-1",
          data: { jobId },
          expireInSeconds: 0.01,
          signal: controller.signal,
        },
        runJob
      ).pipe(
        Effect.provide(JobFibers.layer),
        Effect.provide(workerTestServices),
        Effect.provide(recordingJobQueue().layer)
      )
    );

    expect(seen).toEqual({ reason: "timeout", detail: "Timed out after 1s" });
  });

  it("fails the delivery, without throwing, when the jobId is not a uuid", async () => {
    const runJob = vi.fn(() =>
      Effect.succeed({ outcome: "succeeded" as const, durationMs: 1 })
    );
    forcePayloadValid.on = true;
    try {
      await expect(
        Effect.runPromise(
          processCapJobEffect(
            queuedJob("boss-1", { jobId: "not-a-uuid" }),
            runJob
          ).pipe(
            Effect.provide(JobFibers.layer),
            Effect.provide(workerTestServices),
            Effect.provide(recordingJobQueue().layer)
          )
        )
      ).rejects.toThrow(/malformed jobId/);
    } finally {
      forcePayloadValid.on = false;
    }
    expect(runJob).not.toHaveBeenCalled();
  });
});
