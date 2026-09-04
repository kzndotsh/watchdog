import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";
import { vi } from "vitest";

const workerMocks = vi.hoisted(() => {
  const work = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  const ensureBossWorkerEffect = vi.fn();

  return {
    work,
    stop,
    ensureBossWorkerEffect,
    reconcileStaleJobsEffect: vi.fn(),
    reconcileStuckPlaybookRunsEffect: vi.fn(),
    listenForEventsStream: vi.fn(),
    listActiveJobIds: vi.fn(() => [] as string[]),
    findCancelledJobIdsEffect: vi.fn(),
    handleExportEventEffect: vi.fn(),
    executeJobOnMap: vi.fn(),
  };
});

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    executeJobOnMap: workerMocks.executeJobOnMap,
    findCancelledJobIdsEffect: workerMocks.findCancelledJobIdsEffect,
    ensureBossWorkerEffect: workerMocks.ensureBossWorkerEffect,
    listenForEventsStream: workerMocks.listenForEventsStream,
    listActiveJobIds: workerMocks.listActiveJobIds,
    reconcileStaleJobsEffect: workerMocks.reconcileStaleJobsEffect,
    reconcileStuckPlaybookRunsEffect:
      workerMocks.reconcileStuckPlaybookRunsEffect,
  };
});

vi.mock("@watchdog/env/server", () => ({}));

vi.mock("@watchdog/log", () => ({
  createLogger: vi.fn(() => ({
    set: vi.fn(),
    error: vi.fn(),
    emit: vi.fn(),
  })),
  initWatchdogLogger: vi.fn(),
  jobWideEventFields: vi.fn((fields: unknown) => fields),
}));

vi.mock("../export-events", () => ({
  handleExportEventEffect: workerMocks.handleExportEventEffect,
}));

import { JobFibers } from "@watchdog/core/worker";

import { bootWorkerEffect } from "../boot-worker";

workerMocks.ensureBossWorkerEffect.mockReturnValue(
  Effect.succeed({ work: workerMocks.work, stop: workerMocks.stop })
);
workerMocks.handleExportEventEffect.mockReturnValue(Effect.void);
workerMocks.reconcileStaleJobsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileStuckPlaybookRunsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.findCancelledJobIdsEffect.mockReturnValue(
  Effect.succeed([] as string[])
);
workerMocks.listenForEventsStream.mockReturnValue(Stream.empty);

describe("bootWorkerEffect", () => {
  it.effect("starts pg-boss worker and export event stream", () =>
    Effect.gen(function* bootWorkerEffectTestGen() {
      const fiber = yield* bootWorkerEffect.pipe(
        Effect.provide(JobFibers.layer),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      expect(workerMocks.ensureBossWorkerEffect).toHaveBeenCalledTimes(1);
      expect(workerMocks.reconcileStaleJobsEffect).toHaveBeenCalledTimes(1);
      expect(
        workerMocks.reconcileStuckPlaybookRunsEffect
      ).toHaveBeenCalledTimes(1);
      expect(workerMocks.work).toHaveBeenCalledTimes(1);
      expect(workerMocks.listenForEventsStream).toHaveBeenCalledTimes(1);
      yield* Fiber.interrupt(fiber);
    })
  );
});
