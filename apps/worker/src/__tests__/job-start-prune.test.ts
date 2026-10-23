import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  pruneJobStartCountersEffect: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    pruneJobStartCountersEffect: coreMocks.pruneJobStartCountersEffect,
  };
});

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

import { InternalError } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/worker";

import { jobStartPruneLoopEffect } from "../job-start-prune";

const services = Layer.mergeAll(Db.layer);

describe("jobStartPruneLoopEffect", () => {
  beforeEach(() => {
    coreMocks.pruneJobStartCountersEffect.mockReset();
    emitted.length = 0;
  });

  it.effect("sweeps at boot, then again every hour", () =>
    Effect.gen(function* sweepLoopGen() {
      coreMocks.pruneJobStartCountersEffect.mockReturnValue(
        Effect.succeed({ removed: 0 })
      );
      yield* jobStartPruneLoopEffect.pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(coreMocks.pruneJobStartCountersEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("59 minutes");
      expect(coreMocks.pruneJobStartCountersEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 minute");
      expect(coreMocks.pruneJobStartCountersEffect).toHaveBeenCalledTimes(2);
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.pruneJobStartCountersEffect).toHaveBeenCalledTimes(3);
    })
  );

  it.effect(
    "logs how many it removed, and is quiet when nothing was ended",
    () =>
      Effect.gen(function* sweepLogGen() {
        coreMocks.pruneJobStartCountersEffect
          .mockReturnValueOnce(Effect.succeed({ removed: 3 }))
          .mockReturnValue(Effect.succeed({ removed: 0 }));
        yield* jobStartPruneLoopEffect.pipe(
          Effect.provide(services),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toMatchObject({
          scope: "jobs.start-limits.prune",
          fields: { removed: 3 },
          error: false,
        });
        yield* TestClock.adjust("1 hour");
        expect(emitted).toHaveLength(1);
      })
  );

  it.effect("survives a failed run and tries again the next hour", () =>
    Effect.gen(function* sweepFailureGen() {
      coreMocks.pruneJobStartCountersEffect
        .mockReturnValueOnce(
          Effect.fail(new InternalError({ reason: "database down" }))
        )
        .mockReturnValue(Effect.succeed({ removed: 1 }));
      yield* jobStartPruneLoopEffect.pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        scope: "jobs.start-limits.prune",
        error: true,
      });
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.pruneJobStartCountersEffect).toHaveBeenCalledTimes(2);
      expect(emitted).toHaveLength(2);
      expect(emitted[1]).toMatchObject({
        fields: { removed: 1 },
        error: false,
      });
    })
  );

  it.effect(
    "is interruptible while a run is in flight, so shutdown drains",
    () =>
      Effect.gen(function* sweepInterruptGen() {
        coreMocks.pruneJobStartCountersEffect.mockReturnValue(Effect.never);
        const fiber = yield* jobStartPruneLoopEffect.pipe(
          Effect.provide(services),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        expect(coreMocks.pruneJobStartCountersEffect).toHaveBeenCalledTimes(1);
        yield* Fiber.interrupt(fiber);
        expect(fiber.pollUnsafe()).toBeDefined();
      })
  );
});
