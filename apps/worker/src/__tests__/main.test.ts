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
    reconcileOrphanedQueuedJobsEffect: vi.fn(),
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
    reconcileOrphanedQueuedJobsEffect:
      workerMocks.reconcileOrphanedQueuedJobsEffect,
  };
});

vi.mock("@watchdog/env/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/env/server")>();
  return { ...actual };
});

vi.mock("../export-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export-events")>();
  return {
    ...actual,
    handleExportEventEffect: workerMocks.handleExportEventEffect,
  };
});

import { JobFibers } from "@watchdog/core/worker";

import { bootWorkerEffect } from "../boot-worker";

workerMocks.ensureBossWorkerEffect.mockReturnValue(
  Effect.succeed({ work: workerMocks.work, stop: workerMocks.stop })
);
workerMocks.handleExportEventEffect.mockReturnValue(Effect.void);
workerMocks.reconcileStaleJobsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileStuckPlaybookRunsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileOrphanedQueuedJobsEffect.mockReturnValue(
  Effect.succeed(0)
);
workerMocks.findCancelledJobIdsEffect.mockReturnValue(
  Effect.succeed([] as string[])
);
workerMocks.listenForEventsStream.mockReturnValue(Stream.empty);

describe("bootWorkerEffect", () => {
  it.effect("stops pg-boss worker and export event stream", () =>
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
      expect(
        workerMocks.reconcileOrphanedQueuedJobsEffect
      ).toHaveBeenCalledTimes(1);
      expect(workerMocks.work).toHaveBeenCalledTimes(1);
      expect(workerMocks.listenForEventsStream).toHaveBeenCalledTimes(1);
      yield* Fiber.interrupt(fiber);
    })
  );

  it.effect("unwinds scoped resources when SIGTERM is received", () =>
    Effect.gen(function* bootWorkerSigtermTestGen() {
      workerMocks.stop.mockClear();
      const fiber = yield* bootWorkerEffect.pipe(
        Effect.provide(JobFibers.layer),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      process.emit("SIGTERM");
      yield* Fiber.await(fiber);
      expect(workerMocks.stop).toHaveBeenCalledTimes(1);
    })
  );

  it.effect(
    "force-exits when a second shutdown signal arrives during shutdown",
    () =>
      Effect.gen(function* bootWorkerRepeatSigtermTestGen() {
        const exit = vi
          .spyOn(process, "exit")
          .mockImplementation((() => undefined) as typeof process.exit);
        workerMocks.stop.mockClear();
        const fiber = yield* bootWorkerEffect.pipe(
          Effect.provide(JobFibers.layer),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        process.emit("SIGTERM");
        yield* Effect.yieldNow;
        process.emit("SIGINT");
        expect(exit).toHaveBeenCalledWith(130);
        exit.mockRestore();
        yield* Fiber.interrupt(fiber);
      })
  );
});
