import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  reconcileJobsEffect: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return { ...actual, reconcileJobsEffect: coreMocks.reconcileJobsEffect };
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
import { Db, recordingJobQueue } from "@watchdog/core/worker";

import { jobReconcileLoopEffect } from "../job-reconcile";

const services = Layer.mergeAll(Db.layer, recordingJobQueue().layer);

const QUIET = {
  ran: true,
  stale: 0,
  accessRevoked: 0,
  stuckPlaybooks: 0,
  orphanedQueued: 0,
};

describe("jobReconcileLoopEffect", () => {
  beforeEach(() => {
    coreMocks.reconcileJobsEffect.mockReset();
    emitted.length = 0;
  });

  it.effect("waits one interval, then ticks every interval", () =>
    Effect.gen(function* reconcileLoopGen() {
      coreMocks.reconcileJobsEffect.mockReturnValue(Effect.succeed(QUIET));
      yield* jobReconcileLoopEffect().pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(coreMocks.reconcileJobsEffect).toHaveBeenCalledTimes(0);
      yield* TestClock.adjust("59 seconds");
      expect(coreMocks.reconcileJobsEffect).toHaveBeenCalledTimes(0);
      yield* TestClock.adjust("1 second");
      expect(coreMocks.reconcileJobsEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("60 seconds");
      expect(coreMocks.reconcileJobsEffect).toHaveBeenCalledTimes(2);
    })
  );

  it.effect("takes a shorter interval in tests", () =>
    Effect.gen(function* reconcileShortGen() {
      coreMocks.reconcileJobsEffect.mockReturnValue(Effect.succeed(QUIET));
      yield* jobReconcileLoopEffect("100 millis").pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust("250 millis");
      expect(coreMocks.reconcileJobsEffect).toHaveBeenCalledTimes(2);
    })
  );

  it.effect("logs a repair, is quiet otherwise and when the lock is held", () =>
    Effect.gen(function* reconcileLogGen() {
      coreMocks.reconcileJobsEffect
        .mockReturnValueOnce(Effect.succeed({ ...QUIET, accessRevoked: 2 }))
        .mockReturnValueOnce(Effect.succeed(QUIET))
        .mockReturnValue(Effect.succeed({ ...QUIET, ran: false }));
      yield* jobReconcileLoopEffect().pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust("60 seconds");
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        scope: "worker.reconcile",
        fields: { accessRevoked: 2 },
        error: false,
      });
      yield* TestClock.adjust("120 seconds");
      expect(emitted).toHaveLength(1);
    })
  );

  it.effect("survives a failed tick and tries again", () =>
    Effect.gen(function* reconcileFailureGen() {
      coreMocks.reconcileJobsEffect
        .mockReturnValueOnce(
          Effect.fail(new InternalError({ reason: "database down" }))
        )
        .mockReturnValue(Effect.succeed(QUIET));
      yield* jobReconcileLoopEffect().pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust("60 seconds");
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        scope: "worker.reconcile",
        error: true,
      });
      yield* TestClock.adjust("60 seconds");
      expect(coreMocks.reconcileJobsEffect).toHaveBeenCalledTimes(2);
    })
  );
});
