import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, FiberMap } from "effect";
import { vi, type MockInstance } from "vitest";

const workerMocks = vi.hoisted(() => ({
  reconcileJobsEffect: vi.fn(),
  runActivityConsumerEffect: vi.fn(),
  findCancelledJobIdsEffect: vi.fn(),
  executeJobOnMap: vi.fn(),
}));

// The database boundary. Boot reaches Postgres in four places (running a Cap Job, the cancel
// poll, the activity LISTEN stream, the maintenance runs), none of which a unit test can serve
// from a Db double, so each is stubbed at its core export and nothing else in core is.
vi.mock("@watchdog/core/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/jobs")>();
  return {
    ...actual,
    executeJobOnMap: workerMocks.executeJobOnMap,
    findCancelledJobIdsEffect: workerMocks.findCancelledJobIdsEffect,
  };
});

vi.mock("@watchdog/core/activity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@watchdog/core/activity")>();
  return {
    ...actual,
    runActivityConsumerEffect: workerMocks.runActivityConsumerEffect,
  };
});

// Boot never touches a database in unit tests (CI has none): every maintenance run is a
// no-op except the reconcile, which the boot test counts.
vi.mock("@watchdog/core/maintenance", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@watchdog/core/maintenance")>();
  const quiet = (task: (typeof actual.MAINTENANCE_TASKS)[number]) => ({
    ...task,
    run: Effect.void,
  });
  const reconcile = {
    ...actual.JOB_RECONCILE,
    run: Effect.suspend(() => workerMocks.reconcileJobsEffect()).pipe(
      Effect.as(undefined)
    ),
  };
  return {
    ...actual,
    JOB_RECONCILE: reconcile,
    ACTIVITY_RESTORE_CHECK: {
      ...actual.ACTIVITY_RESTORE_CHECK,
      run: Effect.void,
    },
    MAINTENANCE_TASKS: [
      reconcile,
      ...actual.MAINTENANCE_TASKS.filter(
        (task) => task !== actual.JOB_RECONCILE
      ).map(quiet),
    ],
  };
});

// The logger is the boundary of what boot reports: every `createLogger({ scope })` records
// the fields set on it, so a test reads what the worker said under a scope.
const logged = vi.hoisted(() => ({
  entries: [] as { scope: string; fields: Record<string, unknown> }[],
  startup: [] as { scope: string; messages: readonly string[] }[],
}));

vi.mock("@watchdog/log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/log")>();
  return {
    ...actual,
    logStartupWarnings: (scope: string, messages: readonly string[]) => {
      logged.startup.push({ scope, messages });
    },
    createLogger: (init: { scope?: string }) => ({
      set: (fields: Record<string, unknown>) => {
        logged.entries.push({ scope: init.scope ?? "", fields });
      },
      error: () => {},
      warn: () => {},
      info: () => {},
      emit: () => {},
    }),
  };
});

// Lane settings are configuration, and the unit project does not validate env: give the worker
// real values (`laneSlotsFit` then runs for real against the pool size).
const laneEnv = vi.hoisted(() => ({
  WD_WORKER_QUICK_CONCURRENCY: 2,
  WD_WORKER_HEAVY_CONCURRENCY: 1,
  WD_WORKER_ACT_CONCURRENCY: 1,
  /** The lane setting named `key`, or `undefined` for any other env key. */
  read(key: string | symbol): number | undefined {
    switch (key) {
      case "WD_WORKER_QUICK_CONCURRENCY": {
        return this.WD_WORKER_QUICK_CONCURRENCY;
      }
      case "WD_WORKER_HEAVY_CONCURRENCY": {
        return this.WD_WORKER_HEAVY_CONCURRENCY;
      }
      case "WD_WORKER_ACT_CONCURRENCY": {
        return this.WD_WORKER_ACT_CONCURRENCY;
      }
      default: {
        return undefined;
      }
    }
  },
}));

vi.mock("@watchdog/env/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/env/server")>();
  return {
    ...actual,
    startupWarnings: () => ["DATABASE_URL test warning"],
    env: new Proxy(actual.env, {
      get: (target, key, receiver) =>
        laneEnv.read(key) ?? Reflect.get(target, key, receiver),
    }),
  };
});

import { Db } from "@watchdog/core/infra";
import {
  JobFibers,
  laneConcurrency,
  makeJobQueueLayers,
  type BossDriver,
  type QueuedJob,
} from "@watchdog/core/jobs";
import { OutboundClient } from "@watchdog/tools/http";

import { bootWorkerEffect } from "../boot-worker";
import { WorkerConfigError } from "../config-error";
import { WorkerListenError } from "../errors";
import { provideWorkerLayers } from "../layers";

const JOB_LANES = ["quick", "heavy", "act"] as const;
const CAP_JOB_ID = "11111111-1111-4111-8111-000000000001";

type FakeDriver = {
  readonly driver: BossDriver;
  readonly events: string[];
  readonly start: ReturnType<typeof vi.fn>;
  readonly ensureQueue: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly work: ReturnType<typeof vi.fn>;
};

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
  return provideWorkerLayers(bootWorkerEffect, workerLayer, Db.layer);
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

workerMocks.reconcileJobsEffect.mockReturnValue(
  Effect.succeed({
    ran: true,
    stale: 0,
    accessRevoked: 0,
    stuckPlaybooks: 0,
    orphanedQueued: 0,
    collectQueueRebuilt: 0,
  })
);
workerMocks.findCancelledJobIdsEffect.mockReturnValue(
  Effect.succeed([] as string[])
);
workerMocks.runActivityConsumerEffect.mockReturnValue(Effect.never);

/** The `message` of every `worker.shutdown` log so far. */
function shutdownLogs(): string[] {
  return logged.entries
    .filter(({ scope }) => scope === "worker.shutdown")
    .map(({ fields }) => String(fields.message));
}

describe("bootWorkerEffect", () => {
  const baseline = {
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGINT: process.listenerCount("SIGINT"),
  };

  beforeEach(() => {
    logged.entries.length = 0;
    logged.startup.length = 0;
    laneEnv.WD_WORKER_QUICK_CONCURRENCY = 2;
    workerMocks.runActivityConsumerEffect.mockClear();
    workerMocks.reconcileJobsEffect.mockClear();
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
        expect(workerMocks.reconcileJobsEffect).toHaveBeenCalledTimes(1);
        // One handler per lane, each with its configured concurrency.
        expect(fake.work).toHaveBeenCalledTimes(JOB_LANES.length);
        for (const lane of JOB_LANES) {
          expect(fake.work).toHaveBeenCalledWith(
            {
              lane,
              localConcurrency: laneConcurrency(lane),
              pollingIntervalSeconds: 2,
            },
            expect.any(Function)
          );
        }
        expect(workerMocks.runActivityConsumerEffect).toHaveBeenCalled();
      })
  );

  it.effect("logs the startup transport warnings once at boot", () =>
    Effect.gen(function* bootWorkerWarningsTestGen() {
      yield* startBoot(fakeDriver());
      expect(logged.startup).toEqual([
        {
          scope: "startup-config",
          messages: ["DATABASE_URL test warning"],
        },
      ]);
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
          jobs: QueuedJob[]
        ) => Promise<void>;
        yield* Effect.promise(() =>
          handler([
            {
              id: "boss-1",
              data: { jobId: CAP_JOB_ID },
              expireInSeconds: 60,
              signal: new AbortController().signal,
            },
          ])
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

  it.effect(
    "refuses to boot when the lane slots leave too few pool connections free",
    () =>
      Effect.gen(function* bootWorkerLaneSlotsTestGen() {
        laneEnv.WD_WORKER_QUICK_CONCURRENCY = 10;
        const fake = fakeDriver();
        const fiber = yield* bootWith(fake).pipe(Effect.forkChild);
        bootFibers.push(fiber);
        const result = yield* Fiber.await(fiber);
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = Cause.squash(result.cause);
          expect(error).toBeInstanceOf(WorkerConfigError);
          const reason = (error as WorkerConfigError).reason;
          expect(reason).toContain("WD_WORKER_QUICK_CONCURRENCY");
          expect(reason).toContain("WD_WORKER_HEAVY_CONCURRENCY");
          expect(reason).toContain("WD_WORKER_ACT_CONCURRENCY");
          expect(reason).toContain("12");
          expect(reason).toContain("8");
        }
        // No handler was registered and no Job was reconciled or delivered.
        expect(fake.work).not.toHaveBeenCalled();
        expect(workerMocks.reconcileJobsEffect).not.toHaveBeenCalled();
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

  it.effect("closes the outbound pools when the worker shuts down", () =>
    Effect.gen(function* outboundShutdownTestGen() {
      const { workerLayer } = makeJobQueueLayers(() => fakeDriver().driver);
      const client = yield* provideWorkerLayers(
        Effect.gen(function* grabOutboundClient() {
          return yield* OutboundClient;
        }),
        workerLayer,
        Db.layer
      );
      // The worker's scope has closed: its pools are gone, nothing reopens them.
      const refused = yield* Effect.promise(async () =>
        client.fetch("http://127.0.0.1/").catch((error: unknown) => error)
      );
      expect(refused).toMatchObject({
        message: expect.stringMatching(/closed/),
      });
    })
  );
});
