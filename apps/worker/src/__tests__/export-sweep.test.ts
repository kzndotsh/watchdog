import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";

const coreMocks = vi.hoisted(() => ({
  sweepExpiredCaseExportsEffect: vi.fn(),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    sweepExpiredCaseExportsEffect: coreMocks.sweepExpiredCaseExportsEffect,
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

import { InvalidError } from "@watchdog/core/errors";
import { recordingBlobStore } from "@watchdog/core/worker";

import { exportSweepLoopEffect } from "../export-sweep";

const store = recordingBlobStore().layer;

describe("exportSweepLoopEffect", () => {
  beforeEach(() => {
    coreMocks.sweepExpiredCaseExportsEffect.mockReset();
    emitted.length = 0;
  });

  it.effect("sweeps at boot, then again every hour", () =>
    Effect.gen(function* sweepLoopGen() {
      coreMocks.sweepExpiredCaseExportsEffect.mockReturnValue(
        Effect.succeed(0)
      );
      yield* exportSweepLoopEffect.pipe(
        Effect.provide(store),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(coreMocks.sweepExpiredCaseExportsEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("59 minutes");
      expect(coreMocks.sweepExpiredCaseExportsEffect).toHaveBeenCalledTimes(1);
      yield* TestClock.adjust("1 minute");
      expect(coreMocks.sweepExpiredCaseExportsEffect).toHaveBeenCalledTimes(2);
    })
  );

  it.effect("logs how many it removed, and is quiet when nothing expired", () =>
    Effect.gen(function* sweepLogGen() {
      coreMocks.sweepExpiredCaseExportsEffect
        .mockReturnValueOnce(Effect.succeed(2))
        .mockReturnValue(Effect.succeed(0));
      yield* exportSweepLoopEffect.pipe(
        Effect.provide(store),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        scope: "export.sweep.run",
        fields: { swept: 2 },
        error: false,
      });
      yield* TestClock.adjust("1 hour");
      expect(emitted).toHaveLength(1);
    })
  );

  it.effect("survives a failed run and tries again the next hour", () =>
    Effect.gen(function* sweepFailureGen() {
      coreMocks.sweepExpiredCaseExportsEffect
        .mockReturnValueOnce(
          Effect.fail(new InvalidError({ reason: "store down" }))
        )
        .mockReturnValue(Effect.succeed(1));
      yield* exportSweepLoopEffect.pipe(
        Effect.provide(store),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(emitted[0]).toMatchObject({
        scope: "export.sweep.run",
        error: true,
      });
      yield* TestClock.adjust("1 hour");
      expect(coreMocks.sweepExpiredCaseExportsEffect).toHaveBeenCalledTimes(2);
      expect(emitted[1]).toMatchObject({ fields: { swept: 1 }, error: false });
    })
  );
});
