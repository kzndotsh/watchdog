import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  sweepAbandonedUploadsEffect: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    sweepAbandonedUploadsEffect: coreMocks.sweepAbandonedUploadsEffect,
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
import { Db, recordingBlobStore } from "@watchdog/core/worker";

import { uploadSweepLoopEffect } from "../upload-sweep";

const services = Layer.mergeAll(Db.layer, recordingBlobStore().layer);

describe("uploadSweepLoopEffect", () => {
  beforeEach(() => {
    coreMocks.sweepAbandonedUploadsEffect.mockReset();
    emitted.length = 0;
  });

  it.effect("sweeps at boot, then again every hour", () =>
    Effect.gen(function* sweepLoopGen() {
      coreMocks.sweepAbandonedUploadsEffect.mockReturnValue(
        Effect.succeed({ swept: 0 })
      );
      yield* uploadSweepLoopEffect.pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(coreMocks.sweepAbandonedUploadsEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("59 minutes");
      expect(coreMocks.sweepAbandonedUploadsEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 minute");
      expect(coreMocks.sweepAbandonedUploadsEffect).toHaveBeenCalledTimes(2);
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.sweepAbandonedUploadsEffect).toHaveBeenCalledTimes(3);
    })
  );

  it.effect(
    "logs how many it removed, and is quiet when nothing was abandoned",
    () =>
      Effect.gen(function* sweepLogGen() {
        coreMocks.sweepAbandonedUploadsEffect
          .mockReturnValueOnce(Effect.succeed({ swept: 3 }))
          .mockReturnValue(Effect.succeed({ swept: 0 }));
        yield* uploadSweepLoopEffect.pipe(
          Effect.provide(services),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toMatchObject({
          scope: "evidence.upload-sweep.run",
          fields: { swept: 3 },
          error: false,
        });
        yield* TestClock.adjust("1 hour");
        expect(emitted).toHaveLength(1);
      })
  );

  it.effect("survives a failed run and tries again the next hour", () =>
    Effect.gen(function* sweepFailureGen() {
      coreMocks.sweepAbandonedUploadsEffect
        .mockReturnValueOnce(
          Effect.fail(new InternalError({ reason: "database down" }))
        )
        .mockReturnValue(Effect.succeed({ swept: 1 }));
      yield* uploadSweepLoopEffect.pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        scope: "evidence.upload-sweep.run",
        error: true,
      });
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.sweepAbandonedUploadsEffect).toHaveBeenCalledTimes(2);
      expect(emitted).toHaveLength(2);
      expect(emitted[1]).toMatchObject({
        fields: { swept: 1 },
        error: false,
      });
    })
  );
});
