import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  purgeExpiredCasesEffect: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    purgeExpiredCasesEffect: coreMocks.purgeExpiredCasesEffect,
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

import { casePurgeLoopEffect } from "../case-purge";

const services = Layer.mergeAll(Db.layer, recordingBlobStore().layer);

describe("casePurgeLoopEffect", () => {
  beforeEach(() => {
    coreMocks.purgeExpiredCasesEffect.mockReset();
    emitted.length = 0;
  });

  it.effect("purges at boot, then again every hour", () =>
    Effect.gen(function* purgeLoopGen() {
      coreMocks.purgeExpiredCasesEffect.mockReturnValue(
        Effect.succeed({ purged: 0, failed: 0, skipped: 0 })
      );
      yield* casePurgeLoopEffect.pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(coreMocks.purgeExpiredCasesEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("59 minutes");
      expect(coreMocks.purgeExpiredCasesEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 minute");
      expect(coreMocks.purgeExpiredCasesEffect).toHaveBeenCalledTimes(2);
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.purgeExpiredCasesEffect).toHaveBeenCalledTimes(3);
    })
  );

  it.effect(
    "logs what it purged and what failed, and is quiet when nothing was due",
    () =>
      Effect.gen(function* purgeLogGen() {
        coreMocks.purgeExpiredCasesEffect
          .mockReturnValueOnce(
            Effect.succeed({ purged: 2, failed: 1, skipped: 0 })
          )
          .mockReturnValue(
            Effect.succeed({ purged: 0, failed: 0, skipped: 0 })
          );
        yield* casePurgeLoopEffect.pipe(
          Effect.provide(services),
          Effect.forkChild
        );
        yield* Effect.yieldNow;
        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toMatchObject({
          scope: "case.purge.run",
          fields: { purged: 2, failed: 1 },
          error: false,
        });
        yield* TestClock.adjust("1 hour");
        expect(emitted).toHaveLength(1);
      })
  );

  it.effect("survives a failed run and tries again the next hour", () =>
    Effect.gen(function* purgeFailureGen() {
      coreMocks.purgeExpiredCasesEffect
        .mockReturnValueOnce(
          Effect.fail(new InternalError({ reason: "database down" }))
        )
        .mockReturnValue(Effect.succeed({ purged: 1, failed: 0, skipped: 0 }));
      yield* casePurgeLoopEffect.pipe(
        Effect.provide(services),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        scope: "case.purge.run",
        error: true,
      });
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.purgeExpiredCasesEffect).toHaveBeenCalledTimes(2);
      expect(emitted).toHaveLength(2);
      expect(emitted[1]).toMatchObject({
        fields: { purged: 1 },
        error: false,
      });
    })
  );
});
