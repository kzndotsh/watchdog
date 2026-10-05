import { beforeEach, describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, FiberMap, Stream } from "effect";
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

const workerLog = vi.hoisted(() => ({ emitOnce: vi.fn() }));

vi.mock("../worker-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../worker-log")>();
  return { ...actual, emitOnce: workerLog.emitOnce };
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
import { WorkerListenError } from "../errors";
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

/** The `message` of every `worker.shutdown` log so far. */
function shutdownLogs(): string[] {
  return workerLog.emitOnce.mock.calls
    .filter(([scope]) => scope === "worker.shutdown")
    .map(([, fields]) => (fields as { message: string }).message);
}

describe("bootWorkerEffect", () => {
  beforeEach(() => {
    workerLog.emitOnce.mockClear();
  });

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
        try {
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          process.emit("SIGTERM");
          expect(exit).not.toHaveBeenCalled();
          process.emit("SIGINT");
          expect(exit).toHaveBeenLastCalledWith(130);
          process.emit("SIGTERM");
          expect(exit).toHaveBeenLastCalledWith(143);
        } finally {
          exit.mockRestore();
        }
        yield* Fiber.interrupt(fiber);
      })
  );

  it.effect(
    "force-exits on a repeated signal while boss.stop is still draining",
    () =>
      Effect.gen(function* bootWorkerDrainSignalTestGen() {
        const exit = vi
          .spyOn(process, "exit")
          .mockImplementation((() => undefined) as typeof process.exit);
        const fake = fakeDriver();
        let finishStop: () => void = () => {};
        const pendingStop = new Promise<void>((resolve) => {
          finishStop = resolve;
        });
        fake.stop.mockReturnValueOnce(pendingStop);
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        try {
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          // First signal: runMain interrupts; the drain (stop) is now pending.
          process.emit("SIGTERM");
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber));
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          expect(fake.stop).toHaveBeenCalledTimes(1);
          expect(exit).not.toHaveBeenCalled();
          process.emit("SIGTERM");
          expect(exit).toHaveBeenCalledWith(143);
          finishStop();
          yield* Fiber.await(interrupting);
        } finally {
          finishStop();
          exit.mockRestore();
        }
      })
  );

  it.effect(
    "force-exits on a repeated signal as soon as the Layers are built",
    () =>
      Effect.gen(function* bootWorkerEarlySignalTestGen() {
        const exit = vi
          .spyOn(process, "exit")
          .mockImplementation((() => undefined) as typeof process.exit);
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        try {
          yield* Effect.yieldNow;
          process.emit("SIGINT");
          process.emit("SIGINT");
          expect(exit).toHaveBeenCalledWith(130);
        } finally {
          exit.mockRestore();
        }
        yield* Fiber.interrupt(fiber);
      })
  );

  it.effect(
    "fails the boot with WorkerListenError after draining when LISTEN fails",
    () =>
      Effect.gen(function* bootWorkerListenFailureTestGen() {
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        const args = workerMocks.listenForEventsStream.mock.calls.at(
          -1
        )?.[0] as {
          onError: (error: unknown) => void;
        };
        const cause = new Error("connection lost");
        args.onError(cause);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause);
          expect(error).toBeInstanceOf(WorkerListenError);
          expect(error).toMatchObject({
            _tag: "WorkerListenError",
            code: "worker_listen",
            cause,
          });
        }
        // boss.stop ran (once, graceful) before the failure surfaced.
        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(fake.events).toEqual(["boss.stop"]);
      })
  );

  it.effect("force-exits 1 when LISTEN fails during shutdown", () =>
    Effect.gen(function* bootWorkerListenDuringShutdownTestGen() {
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation((() => undefined) as typeof process.exit);
      const fake = fakeDriver();
      const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
      try {
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        const args = workerMocks.listenForEventsStream.mock.calls.at(
          -1
        )?.[0] as {
          onError: (error: unknown) => void;
        };
        process.emit("SIGTERM");
        args.onError(new Error("connection lost"));
        expect(exit).toHaveBeenCalledWith(1);
      } finally {
        exit.mockRestore();
      }
      yield* Fiber.interrupt(fiber);
    })
  );

  it.effect.each(["SIGTERM", "SIGINT"] as const)(
    "names the %s signal in the shutdown log, after the queue drained",
    (signal) =>
      Effect.gen(function* bootWorkerSignalLogTestGen() {
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        // The first signal: runMain interrupts the main fiber.
        process.emit(signal);
        yield* Fiber.interrupt(fiber);
        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(shutdownLogs()).toEqual([`shutting down (${signal})`]);
      })
  );

  it.effect("keeps the first signal when a second one arrives", () =>
    Effect.gen(function* bootWorkerFirstSignalTestGen() {
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation((() => undefined) as typeof process.exit);
      const fake = fakeDriver();
      const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
      try {
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        process.emit("SIGTERM");
        process.emit("SIGINT");
        expect(exit).toHaveBeenLastCalledWith(130);
      } finally {
        exit.mockRestore();
      }
      yield* Fiber.interrupt(fiber);
      expect(shutdownLogs()).toEqual(["shutting down (SIGTERM)"]);
    })
  );

  it.effect("logs (interrupt) when interrupted without a signal", () =>
    Effect.gen(function* bootWorkerInterruptLogTestGen() {
      const fake = fakeDriver();
      const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      expect(shutdownLogs()).toEqual(["shutting down (interrupt)"]);
    })
  );

  it.effect("logs (failure) when LISTEN fails", () =>
    Effect.gen(function* bootWorkerFailureLogTestGen() {
      const fake = fakeDriver();
      const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const args = workerMocks.listenForEventsStream.mock.calls.at(-1)?.[0] as {
        onError: (error: unknown) => void;
      };
      args.onError(new Error("connection lost"));
      yield* Fiber.await(fiber);
      expect(shutdownLogs()).toEqual(["shutting down (failure)"]);
    })
  );
});
