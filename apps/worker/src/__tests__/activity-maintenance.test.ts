import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  pruneActivityEffect: vi.fn(),
  repairRestoredActivityXidsEffect: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    pruneActivityEffect: coreMocks.pruneActivityEffect,
    repairRestoredActivityXidsEffect:
      coreMocks.repairRestoredActivityXidsEffect,
  };
});

const logMocks = vi.hoisted(() => ({
  emitOnce: vi.fn(),
  logWorkerError: vi.fn(),
}));

vi.mock("../worker-log", () => logMocks);

import { InternalError } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/worker";

import {
  activityPruneLoopEffect,
  repairRestoredActivityXidsAtBootEffect,
} from "../activity-maintenance";

describe("activityPruneLoopEffect", () => {
  beforeEach(() => {
    coreMocks.pruneActivityEffect.mockReset();
    logMocks.emitOnce.mockReset();
    logMocks.logWorkerError.mockReset();
  });

  it.effect("prunes at boot, then again every 24 hours", () =>
    Effect.gen(function* pruneLoopGen() {
      coreMocks.pruneActivityEffect.mockReturnValue(
        Effect.succeed({ pruned: 0, batches: 0 })
      );
      yield* activityPruneLoopEffect.pipe(
        Effect.provide(Db.layer),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(coreMocks.pruneActivityEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("23 hours");
      expect(coreMocks.pruneActivityEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.pruneActivityEffect).toHaveBeenCalledTimes(2);
      yield* TestClock.adjust("24 hours");
      expect(coreMocks.pruneActivityEffect).toHaveBeenCalledTimes(3);
    })
  );

  it.effect("logs what it pruned and says nothing when there was nothing", () =>
    Effect.gen(function* pruneLogGen() {
      coreMocks.pruneActivityEffect
        .mockReturnValueOnce(Effect.succeed({ pruned: 12, batches: 1 }))
        .mockReturnValue(Effect.succeed({ pruned: 0, batches: 0 }));
      yield* activityPruneLoopEffect.pipe(
        Effect.provide(Db.layer),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(logMocks.emitOnce).toHaveBeenCalledTimes(1);
      expect(logMocks.emitOnce).toHaveBeenCalledWith(
        "activity.retention",
        expect.objectContaining({ pruned: 12 })
      );
      yield* TestClock.adjust("24 hours");
      expect(logMocks.emitOnce).toHaveBeenCalledTimes(1);
    })
  );

  it.effect(
    "survives a failed prune: it is logged and the next run still happens",
    () =>
      Effect.gen(function* pruneFailureGen() {
        coreMocks.pruneActivityEffect
          .mockReturnValueOnce(
            Effect.fail(new InternalError({ reason: "db down" }))
          )
          .mockReturnValue(Effect.succeed({ pruned: 0, batches: 0 }));
        yield* activityPruneLoopEffect.pipe(
          Effect.provide(Db.layer),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        expect(logMocks.logWorkerError).toHaveBeenCalledTimes(1);
        yield* TestClock.adjust("24 hours");
        expect(coreMocks.pruneActivityEffect).toHaveBeenCalledTimes(2);
      })
  );
});

describe("repairRestoredActivityXidsAtBootEffect", () => {
  beforeEach(() => {
    coreMocks.repairRestoredActivityXidsEffect.mockReset();
    logMocks.emitOnce.mockReset();
    logMocks.logWorkerError.mockReset();
  });

  it.effect("announces a repair", () =>
    Effect.gen(function* repairLogGen() {
      coreMocks.repairRestoredActivityXidsEffect.mockReturnValue(
        Effect.succeed({ repaired: 7 })
      );
      yield* repairRestoredActivityXidsAtBootEffect().pipe(
        Effect.provide(Db.layer)
      );
      expect(logMocks.emitOnce).toHaveBeenCalledWith(
        "activity.restore",
        expect.objectContaining({ repaired: 7 })
      );
    })
  );

  it.effect("is silent on a healthy log", () =>
    Effect.gen(function* repairQuietGen() {
      coreMocks.repairRestoredActivityXidsEffect.mockReturnValue(
        Effect.succeed({ repaired: 0 })
      );
      yield* repairRestoredActivityXidsAtBootEffect().pipe(
        Effect.provide(Db.layer)
      );
      expect(logMocks.emitOnce).not.toHaveBeenCalled();
    })
  );

  it.effect("logs a failure and lets the boot continue", () =>
    Effect.gen(function* repairFailureGen() {
      coreMocks.repairRestoredActivityXidsEffect.mockReturnValue(
        Effect.fail(new InternalError({ reason: "db down" }))
      );
      yield* repairRestoredActivityXidsAtBootEffect().pipe(
        Effect.provide(Db.layer)
      );
      expect(logMocks.logWorkerError).toHaveBeenCalledTimes(1);
    })
  );
});
