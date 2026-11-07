import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, FiberMap } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";

const pollMocks = vi.hoisted(() => ({
  findCancelledJobIdsEffect: vi.fn(),
  abort: vi.fn(),
  listIds: vi.fn(() => [] as string[]),
}));

vi.mock("@watchdog/core/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/jobs")>();
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

import { Db } from "@watchdog/core/infra";
import { JobFibers } from "@watchdog/core/jobs";

import { cancelPollLoopEffect } from "../cancel-poll";

describe("cancelPollLoopEffect", () => {
  it.effect("polls immediately then again after 2 seconds on TestClock", () =>
    Effect.gen(function* cancelPollLoopTestGen() {
      pollMocks.listIds.mockReturnValue(["job-1"]);
      pollMocks.findCancelledJobIdsEffect.mockReturnValue(
        Effect.succeed(["job-1"])
      );

      const map = yield* FiberMap.make<string>();
      const fiber = yield* cancelPollLoopEffect.pipe(
        Effect.provideService(
          JobFibers,
          JobFibers.of({
            map,
            abort: (jobId, stop) =>
              Effect.sync(() => {
                pollMocks.abort(jobId, stop);
                return true;
              }),
            abortAll: () => {
              throw new Error("the cancel poll stops one Job at a time");
            },
            listIds: pollMocks.listIds,
            attemptFor: () => {
              throw new Error("the cancel poll never reads an attempt");
            },
            clearAttempt: () => {},
          })
        ),
        Effect.provide(Db.layer),
        Effect.forkChild
      );
      yield* Effect.yieldNow;
      expect(pollMocks.abort).toHaveBeenCalledTimes(1);
      expect(pollMocks.abort).toHaveBeenCalledWith("job-1", {
        cause: "user_cancelled",
      });
      yield* TestClock.adjust("2 seconds");
      yield* Effect.yieldNow;
      expect(pollMocks.abort).toHaveBeenCalledTimes(2);
      yield* Fiber.interrupt(fiber);
    })
  );
});
