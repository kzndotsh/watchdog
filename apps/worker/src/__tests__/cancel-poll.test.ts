import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";

const pollMocks = vi.hoisted(() => ({
  findCancelledJobIdsEffect: vi.fn(),
  abort: vi.fn(),
  listIds: vi.fn(() => [] as string[]),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    findCancelledJobIdsEffect: pollMocks.findCancelledJobIdsEffect,
  };
});

vi.mock("@watchdog/log", () => ({
  createLogger: vi.fn(() => ({
    set: vi.fn(),
    error: vi.fn(),
    emit: vi.fn(),
  })),
}));

import { JobFibers } from "@watchdog/core/worker";

import { cancelPollLoopEffect } from "../cancel-poll";

describe("cancelPollLoopEffect", () => {
  it.effect("polls immediately then again after 2 seconds on TestClock", () =>
    Effect.gen(function* cancelPollLoopTestGen() {
      pollMocks.listIds.mockReturnValue(["job-1"]);
      pollMocks.findCancelledJobIdsEffect.mockReturnValue(
        Effect.succeed(["job-1"])
      );

      const fiber = yield* cancelPollLoopEffect.pipe(
        Effect.provideService(
          JobFibers,
          JobFibers.of({
            map: {} as never,
            abort: (jobId, reason) =>
              Effect.sync(() => {
                pollMocks.abort(jobId, reason);
                return true;
              }),
            listIds: pollMocks.listIds,
            peekReason: () => undefined,
            setReason: () => {},
            clearReason: () => {},
          })
        ),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(pollMocks.abort).toHaveBeenCalledTimes(1);
      expect(pollMocks.abort).toHaveBeenCalledWith("job-1", "cancel");
      yield* TestClock.adjust("2 seconds");
      yield* Effect.yieldNow;
      expect(pollMocks.abort).toHaveBeenCalledTimes(2);
      yield* Fiber.interrupt(fiber);
    })
  );
});
