import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, FiberMap, Stream } from "effect";
import { vi } from "vitest";

const workerMocks = vi.hoisted(() => ({
  reconcileStaleJobsEffect: vi.fn(),
  reconcileStuckPlaybookRunsEffect: vi.fn(),
  reconcileOrphanedQueuedJobsEffect: vi.fn(),
  listenForEventsStream: vi.fn(),
  listActiveJobIds: vi.fn(() => [] as string[]),
  findCancelledJobIdsEffect: vi.fn(),
  executeJobOnMap: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    executeJobOnMap: workerMocks.executeJobOnMap,
    findCancelledJobIdsEffect: workerMocks.findCancelledJobIdsEffect,
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

import {
  JobFibers,
  makeJobQueueLayers,
  type BossDriver,
} from "@watchdog/core/worker";

import { bootWorkerEffect } from "../boot-worker";
import { provideWorkerLayers } from "../layers";

const CAP_JOB_ID = "11111111-1111-4111-8111-000000000001";

interface FakeDriver {
  readonly driver: BossDriver;
  readonly events: string[];
  readonly start: ReturnType<typeof vi.fn>;
  readonly ensureQueue: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly work: ReturnType<typeof vi.fn>;
}

function fakeDriver(): FakeDriver {
  const events: string[] = [];
  const start = vi.fn(async () => {});
  const ensureQueue = vi.fn(async () => {});
  const stop = vi.fn(async () => {
    events.push("boss.stop");
  });
  const work = vi.fn(async () => {});
  const send = vi.fn(async () => {});
  return {
    driver: { start, stop, ensureQueue, work, send },
    events,
    start,
    ensureQueue,
    stop,
    work,
  };
}

function bootWith(fake: FakeDriver) {
  const { workerLayer } = makeJobQueueLayers(() => fake.driver);
  return provideWorkerLayers(bootWorkerEffect, workerLayer);
}

workerMocks.reconcileStaleJobsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileStuckPlaybookRunsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileOrphanedQueuedJobsEffect.mockReturnValue(
  Effect.succeed(0)
);
workerMocks.findCancelledJobIdsEffect.mockReturnValue(
  Effect.succeed([] as string[])
);
workerMocks.listenForEventsStream.mockReturnValue(Stream.never);

describe("bootWorkerEffect", () => {
  it.effect(
    "starts the queue, reconciles, registers the handler and listens",
    () =>
      Effect.gen(function* bootWorkerEffectTestGen() {
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        expect(fake.start).toHaveBeenCalledTimes(1);
        expect(fake.ensureQueue).toHaveBeenCalledTimes(1);
        expect(workerMocks.reconcileStaleJobsEffect).toHaveBeenCalled();
        expect(workerMocks.reconcileStuckPlaybookRunsEffect).toHaveBeenCalled();
        expect(
          workerMocks.reconcileOrphanedQueuedJobsEffect
        ).toHaveBeenCalled();
        expect(fake.work).toHaveBeenCalledTimes(1);
        expect(fake.work).toHaveBeenCalledWith(
          { localConcurrency: 1, pollingIntervalSeconds: 2 },
          expect.any(Function)
        );
        expect(workerMocks.listenForEventsStream).toHaveBeenCalled();
        yield* Fiber.interrupt(fiber);
      })
  );

  it.effect(
    "drains pg-boss once when the main fiber is interrupted (SIGTERM path)",
    () =>
      Effect.gen(function* bootWorkerInterruptTestGen() {
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        // NodeRuntime.runMain interrupts the main fiber on the first signal.
        yield* Fiber.interrupt(fiber);
        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(fake.stop).toHaveBeenCalledWith({
          graceful: true,
          timeout: expect.any(Number),
        });
      })
  );

  it.effect(
    "stops the queue before JobFibers interrupts in-flight Cap Jobs",
    () =>
      Effect.gen(function* bootWorkerOrderTestGen() {
        const fake = fakeDriver();
        workerMocks.executeJobOnMap.mockImplementation(() =>
          Effect.gen(function* runInFlightJobGen() {
            const fibers = yield* JobFibers;
            yield* FiberMap.run(
              fibers.map,
              CAP_JOB_ID,
              Effect.never.pipe(
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    fake.events.push("job.interrupted");
                  })
                )
              )
            );
            return { outcome: "succeeded" as const, durationMs: 1 };
          })
        );
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        const handler = fake.work.mock.calls[0]?.[1] as (
          jobs: { id: string; data: unknown }[]
        ) => Promise<void>;
        yield* Effect.promise(() =>
          handler([{ id: "boss-1", data: { jobId: CAP_JOB_ID } }])
        );
        yield* Fiber.interrupt(fiber);
        expect(fake.events).toEqual(["boss.stop", "job.interrupted"]);
      })
  );

  it.effect(
    "force-exits on a repeated shutdown signal, with the signal's exit code",
    () =>
      Effect.gen(function* bootWorkerRepeatSigtermTestGen() {
        const exit = vi
          .spyOn(process, "exit")
          .mockImplementation((() => undefined) as typeof process.exit);
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        process.emit("SIGTERM");
        expect(exit).not.toHaveBeenCalled();
        process.emit("SIGINT");
        expect(exit).toHaveBeenLastCalledWith(130);
        process.emit("SIGTERM");
        expect(exit).toHaveBeenLastCalledWith(143);
        exit.mockRestore();
        yield* Fiber.interrupt(fiber);
      })
  );

  it.effect("ends the boot normally and drains when LISTEN fails", () =>
    Effect.gen(function* bootWorkerListenFailureTestGen() {
      const fake = fakeDriver();
      const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const args = workerMocks.listenForEventsStream.mock.calls.at(-1)?.[0] as {
        onError: (error: unknown) => void;
      };
      args.onError(new Error("connection lost"));
      const exit = yield* Fiber.await(fiber);
      expect(exit._tag).toBe("Success");
      expect(fake.stop).toHaveBeenCalledTimes(1);
    })
  );
});
