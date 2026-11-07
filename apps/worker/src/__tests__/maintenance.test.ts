import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

/** The logging boundary: every emitted wide event, with its scope, fields and whether it carried an error. */
const emitted = vi.hoisted(
  () =>
    [] as { scope: string; fields: Record<string, unknown>; error: boolean }[]
);

vi.mock("@watchdog/log", () => ({
  createLogger: (initial: { scope: string }) => {
    const entry = { scope: initial.scope, fields: {}, error: false };
    return {
      set: (fields: Record<string, unknown>) => {
        entry.fields = { ...entry.fields, ...fields };
      },
      error: () => {
        entry.error = true;
      },
      emit: () => {
        emitted.push({ ...entry });
        return Promise.resolve();
      },
    };
  },
}));

import { recordingBlobStore } from "@watchdog/core/blob";
import { InternalError } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/infra";
import { recordingJobQueue } from "@watchdog/core/jobs";
import type { MaintenanceTask } from "@watchdog/core/maintenance";

import {
  forkMaintenanceEffect,
  maintenanceLoopEffect,
  runMaintenanceOnceEffect,
} from "../maintenance";

const services = Layer.mergeAll(
  Db.layer,
  recordingBlobStore().layer,
  recordingJobQueue().layer
);

type Run = MaintenanceTask["run"];

function taskOf(run: () => Run, over: Partial<MaintenanceTask> = {}) {
  const task: MaintenanceTask = {
    name: "test.task",
    failureMessage: "test task failed",
    every: "1 hour",
    run: Effect.suspend(run),
    source: run,
    report: () => undefined,
    ...over,
  };
  return task;
}

describe("maintenanceLoopEffect", () => {
  beforeEach(() => {
    emitted.length = 0;
  });

  it.effect("runs at boot, then again every spacing", () =>
    Effect.gen(function* loopScheduleGen() {
      const run = vi.fn(() => Effect.sync(() => undefined));
      yield* maintenanceLoopEffect(taskOf(run)).pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(run).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("59 minutes");
      expect(run).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 minute");
      expect(run).toHaveBeenCalledTimes(2);
      yield* TestClock.adjust("1 hour");
      expect(run).toHaveBeenCalledTimes(3);
    })
  );

  it.effect("waits one spacing before the first run when asked", () =>
    Effect.gen(function* loopDelayFirstGen() {
      const run = vi.fn(() => Effect.sync(() => undefined));
      yield* maintenanceLoopEffect(
        taskOf(run, { every: "60 seconds", delayFirst: true })
      ).pipe(Effect.provide(services), Effect.forkChild);
      yield* Effect.yieldNow;
      expect(run).toHaveBeenCalledTimes(0);
      yield* TestClock.adjust("59 seconds");
      expect(run).toHaveBeenCalledTimes(0);
      yield* TestClock.adjust("1 second");
      expect(run).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("60 seconds");
      expect(run).toHaveBeenCalledTimes(2);
    })
  );

  it.effect(
    "logs a report under the task's name, and is quiet without one",
    () =>
      Effect.gen(function* loopReportGen() {
        const run = vi
          .fn<() => Run>()
          .mockReturnValueOnce(Effect.succeed({ message: "did 2", done: 2 }))
          .mockReturnValue(Effect.sync(() => undefined));
        yield* maintenanceLoopEffect(taskOf(run)).pipe(
          Effect.provide(services),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        expect(emitted).toEqual([
          {
            scope: "test.task",
            fields: { message: "did 2", done: 2 },
            error: false,
          },
        ]);
        yield* TestClock.adjust("1 hour");
        expect(run).toHaveBeenCalledTimes(2);
        expect(emitted).toHaveLength(1);
      })
  );

  it.effect("logs a failed run and a defect, and keeps running", () =>
    Effect.gen(function* loopFailureGen() {
      const run = vi
        .fn<() => Run>()
        .mockReturnValueOnce(
          Effect.fail(new InternalError({ reason: "database down" }))
        )
        .mockReturnValueOnce(Effect.die(new Error("boom")))
        .mockReturnValue(Effect.succeed({ message: "ok" }));
      yield* maintenanceLoopEffect(taskOf(run)).pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(emitted).toEqual([
        {
          scope: "test.task",
          fields: { message: "test task failed" },
          error: true,
        },
      ]);
      yield* TestClock.adjust("1 hour");
      expect(emitted).toHaveLength(2);
      expect(emitted[1]).toMatchObject({ scope: "test.task", error: true });
      yield* TestClock.adjust("1 hour");
      expect(run).toHaveBeenCalledTimes(3);
      expect(emitted[2]).toEqual({
        scope: "test.task",
        fields: { message: "ok" },
        error: false,
      });
    })
  );
});

describe("runMaintenanceOnceEffect", () => {
  it.effect("never fails, whatever the run does", () =>
    Effect.gen(function* onceNeverFailsGen() {
      emitted.length = 0;
      yield* runMaintenanceOnceEffect(
        taskOf(() => Effect.fail(new InternalError({ reason: "x" })))
      ).pipe(Effect.provide(services));
      expect(emitted).toHaveLength(1);
    })
  );
});

describe("forkMaintenanceEffect", () => {
  it.effect("forks every task on its own spacing", () =>
    Effect.gen(function* forkAllGen() {
      const hourly = vi.fn(() => Effect.sync(() => undefined));
      const daily = vi.fn(() => Effect.sync(() => undefined));
      yield* forkMaintenanceEffect([
        taskOf(hourly),
        taskOf(daily, { every: "24 hours" }),
      ]);
      yield* Effect.yieldNow;
      expect(hourly).toHaveBeenCalledTimes(1);
      expect(daily).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 hour");
      expect(hourly).toHaveBeenCalledTimes(2);
      expect(daily).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(services), Effect.scoped)
  );
});
