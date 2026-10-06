import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, FiberMap } from "effect";
import { vi, type MockInstance } from "vitest";

const workerMocks = vi.hoisted(() => ({
  reconcileStaleJobsEffect: vi.fn(),
  reconcileStuckPlaybookRunsEffect: vi.fn(),
  reconcileOrphanedQueuedJobsEffect: vi.fn(),
  runActivityConsumerEffect: vi.fn(),
  // Boot never touches a database in unit tests (CI has none).
  pruneActivityEffect: vi.fn(() => Effect.succeed({ pruned: 0, batches: 0 })),
  repairRestoredActivityXidsEffect: vi.fn(() =>
    Effect.succeed({ repaired: 0 })
  ),
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
    runActivityConsumerEffect: workerMocks.runActivityConsumerEffect,
    pruneActivityEffect: workerMocks.pruneActivityEffect,
    repairRestoredActivityXidsEffect:
      workerMocks.repairRestoredActivityXidsEffect,
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

/** Boot fibers started by the current test; `afterEach` always interrupts them. */
const bootFibers: Fiber.Fiber<unknown, unknown>[] = [];
let exit: MockInstance<typeof process.exit>;

/**
 * Fork the boot and wait until it is ready: the shutdown listeners are
 * installed, the queue handler is registered and LISTEN has started. A failed
 * assertion cannot leak the fiber (and its signal listeners): `afterEach`
 * interrupts every fiber started here.
 */
function startBoot(fake: FakeDriver, { listening = true } = {}) {
  return Effect.gen(function* startBootGen() {
    // Baseline first: the test process may already hold signal listeners, so
    // "any listener" would return before the worker installs its own.
    const sigtermBaseline = process.listenerCount("SIGTERM");
    const sigintBaseline = process.listenerCount("SIGINT");
    const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
    bootFibers.push(fiber);
    yield* Effect.promise(() =>
      vi.waitFor(() => {
        expect(process.listenerCount("SIGTERM")).toBeGreaterThan(
          sigtermBaseline
        );
        expect(process.listenerCount("SIGINT")).toBeGreaterThan(sigintBaseline);
        if (listening) {
          expect(fake.work).toHaveBeenCalled();
          expect(workerMocks.runActivityConsumerEffect).toHaveBeenCalled();
        }
      })
    );
    return fiber;
  });
}

workerMocks.reconcileStaleJobsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileStuckPlaybookRunsEffect.mockReturnValue(Effect.succeed(0));
workerMocks.reconcileOrphanedQueuedJobsEffect.mockReturnValue(
  Effect.succeed(0)
);
workerMocks.findCancelledJobIdsEffect.mockReturnValue(
  Effect.succeed([] as string[])
);
workerMocks.runActivityConsumerEffect.mockReturnValue(Effect.never);

/** The `message` of every `worker.shutdown` log so far. */
function shutdownLogs(): string[] {
  return workerLog.emitOnce.mock.calls
    .filter(([scope]) => scope === "worker.shutdown")
    .map(([, fields]) => (fields as { message: string }).message);
}

describe("bootWorkerEffect", () => {
  const baseline = {
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGINT: process.listenerCount("SIGINT"),
  };

  beforeEach(() => {
    workerLog.emitOnce.mockClear();
    workerMocks.runActivityConsumerEffect.mockClear();
    workerMocks.reconcileStaleJobsEffect.mockClear();
    workerMocks.reconcileStuckPlaybookRunsEffect.mockClear();
    workerMocks.reconcileOrphanedQueuedJobsEffect.mockClear();
    // Every test may emit real signals: a stale handler must never reach the
    // real process.exit and kill the vitest worker.
    exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as typeof process.exit);
  });

  afterEach(async () => {
    const fibers = bootFibers.splice(0);
    try {
      await Effect.runPromise(
        Effect.forEach(fibers, (fiber) => Fiber.interrupt(fiber), {
          discard: true,
        })
      );
    } finally {
      exit.mockRestore();
    }
    expect(process.listenerCount("SIGTERM")).toBe(baseline.SIGTERM);
    expect(process.listenerCount("SIGINT")).toBe(baseline.SIGINT);
  });

  it.effect(
    "starts the queue, reconciles, registers the handler and listens",
    () =>
      Effect.gen(function* bootWorkerEffectTestGen() {
        const fake = fakeDriver();
        yield* startBoot(fake);
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
        expect(workerMocks.runActivityConsumerEffect).toHaveBeenCalled();
      })
  );

  it.effect(
    "drains pg-boss once when the main fiber is interrupted (SIGTERM path)",
    () =>
      Effect.gen(function* bootWorkerInterruptTestGen() {
        const fake = fakeDriver();
        const fiber = yield* startBoot(fake);
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
        const fiber = yield* startBoot(fake);
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
        yield* startBoot(fakeDriver());
        process.emit("SIGTERM");
        expect(exit).not.toHaveBeenCalled();
        process.emit("SIGINT");
        expect(exit).toHaveBeenLastCalledWith(130);
        process.emit("SIGTERM");
        expect(exit).toHaveBeenLastCalledWith(143);
      })
  );

  it.effect(
    "force-exits on a repeated signal while boss.stop is still draining",
    () =>
      Effect.gen(function* bootWorkerDrainSignalTestGen() {
        const fake = fakeDriver();
        let finishStop: () => void = () => {};
        const pendingStop = new Promise<void>((resolve) => {
          finishStop = resolve;
        });
        fake.stop.mockReturnValueOnce(pendingStop);
        const fiber = yield* startBoot(fake);
        try {
          // First signal: runMain interrupts; the drain (stop) is now pending.
          process.emit("SIGTERM");
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber));
          yield* Effect.promise(() =>
            vi.waitFor(() => {
              expect(fake.stop).toHaveBeenCalledTimes(1);
            })
          );
          expect(exit).not.toHaveBeenCalled();
          process.emit("SIGTERM");
          expect(exit).toHaveBeenCalledWith(143);
          finishStop();
          yield* Fiber.await(interrupting);
        } finally {
          finishStop();
        }
      })
  );

  it.effect(
    "force-exits on a repeated signal as soon as the Layers are built",
    () =>
      Effect.gen(function* bootWorkerEarlySignalTestGen() {
        yield* startBoot(fakeDriver(), { listening: false });
        process.emit("SIGINT");
        process.emit("SIGINT");
        expect(exit).toHaveBeenCalledWith(130);
      })
  );

  it.effect(
    "fails the boot with WorkerListenError after draining when LISTEN fails",
    () =>
      Effect.gen(function* bootWorkerListenFailureTestGen() {
        const fake = fakeDriver();
        const fiber = yield* startBoot(fake);
        const args = workerMocks.runActivityConsumerEffect.mock.calls.at(
          -1
        )?.[0] as {
          onListenError: (error: unknown) => void;
        };
        const cause = new Error("connection lost");
        args.onListenError(cause);
        const result = yield* Fiber.await(fiber);
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = Cause.squash(result.cause);
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
      yield* startBoot(fakeDriver());
      const args = workerMocks.runActivityConsumerEffect.mock.calls.at(
        -1
      )?.[0] as {
        onListenError: (error: unknown) => void;
      };
      process.emit("SIGTERM");
      args.onListenError(new Error("connection lost"));
      expect(exit).toHaveBeenCalledWith(1);
    })
  );

  it.effect.each(["SIGTERM", "SIGINT"] as const)(
    "names the %s signal in the shutdown log, after the queue drained",
    (signal) =>
      Effect.gen(function* bootWorkerSignalLogTestGen() {
        const fake = fakeDriver();
        const fiber = yield* startBoot(fake);
        // The first signal: runMain interrupts the main fiber.
        process.emit(signal);
        yield* Fiber.interrupt(fiber);
        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(shutdownLogs()).toEqual([`shutting down (${signal})`]);
      })
  );

  it.effect("keeps the first signal when a second one arrives", () =>
    Effect.gen(function* bootWorkerFirstSignalTestGen() {
      const fiber = yield* startBoot(fakeDriver());
      process.emit("SIGTERM");
      process.emit("SIGINT");
      expect(exit).toHaveBeenLastCalledWith(130);
      yield* Fiber.interrupt(fiber);
      expect(shutdownLogs()).toEqual(["shutting down (SIGTERM)"]);
    })
  );

  it.effect("logs (interrupt) when interrupted without a signal", () =>
    Effect.gen(function* bootWorkerInterruptLogTestGen() {
      const fiber = yield* startBoot(fakeDriver());
      yield* Fiber.interrupt(fiber);
      expect(shutdownLogs()).toEqual(["shutting down (interrupt)"]);
    })
  );

  it.effect("logs (failure) when LISTEN fails", () =>
    Effect.gen(function* bootWorkerFailureLogTestGen() {
      const fiber = yield* startBoot(fakeDriver());
      const args = workerMocks.runActivityConsumerEffect.mock.calls.at(
        -1
      )?.[0] as {
        onListenError: (error: unknown) => void;
      };
      args.onListenError(new Error("connection lost"));
      yield* Fiber.await(fiber);
      expect(shutdownLogs()).toEqual(["shutting down (failure)"]);
    })
  );
});
