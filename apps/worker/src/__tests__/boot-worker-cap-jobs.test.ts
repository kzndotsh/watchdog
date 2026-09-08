import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { failInvalidCapDeliveryEffect } = vi.hoisted(() => ({
  failInvalidCapDeliveryEffect: vi.fn(() => Effect.void),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    failInvalidCapDeliveryEffect,
  };
});

import { JobFibers } from "@watchdog/core/worker";

import { processCapJobBatchEffect, processCapJobEffect } from "../boot-worker";

describe("processCapJobEffect", () => {
  beforeEach(() => {
    failInvalidCapDeliveryEffect.mockClear();
    failInvalidCapDeliveryEffect.mockReturnValue(Effect.void);
  });

  it("does not run jobs for invalid payloads", async () => {
    const runJob = vi.fn(() =>
      Effect.succeed({ outcome: "succeeded" as const })
    );

    await expect(
      Effect.runPromise(
        processCapJobEffect({ id: "boss-1", data: null }, runJob).pipe(
          Effect.provide(JobFibers.layer)
        )
      )
    ).rejects.toThrow(/unrecoverable cap payload/);

    expect(failInvalidCapDeliveryEffect).not.toHaveBeenCalled();
    expect(runJob).not.toHaveBeenCalled();
  });

  it("fails empty pg-boss batches", async () => {
    const runJob = vi.fn(() =>
      Effect.succeed({ outcome: "succeeded" as const })
    );

    await expect(
      Effect.runPromise(
        processCapJobBatchEffect([], runJob).pipe(
          Effect.provide(JobFibers.layer)
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
        caseId: "case-1",
        capabilityId: "network.dns.lookup",
        playbookRunId: null,
      })
    );

    await Effect.runPromise(
      processCapJobBatchEffect(
        [
          {
            id: "boss-1",
            data: { jobId: "00000000-0000-4000-8000-000000000001" },
          },
          {
            id: "boss-2",
            data: { jobId: "00000000-0000-4000-8000-000000000002" },
          },
        ],
        runJob
      ).pipe(Effect.provide(JobFibers.layer))
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
        caseId: "case-1",
        capabilityId: "network.dns.lookup",
        playbookRunId: null,
      })
    );

    await Effect.runPromise(
      processCapJobBatchEffect(
        [
          {
            id: "boss-1",
            data: {
              jobId: "  00000000-0000-4000-8000-000000000001  ",
            },
          },
        ],
        runJob
      ).pipe(Effect.provide(JobFibers.layer))
    );

    expect(runJob).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  });
});
