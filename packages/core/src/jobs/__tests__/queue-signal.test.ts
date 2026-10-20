import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, FiberMap } from "effect";
import { TestClock } from "effect/testing";

import { abortFailureMessage, JobFibers, timedOutMessage } from "../job-fibers";
import { interruptOnQueueSignal } from "../queue-signal";

const JOB_ID = "11111111-1111-4111-8111-000000000001";

/** Stand-in for `executeJobOnMap`: a Job fiber in the map, awaited by the caller. */
const runInMap = Effect.gen(function* runInMapGen() {
  const fibers = yield* JobFibers;
  const fiber = yield* FiberMap.run(fibers.map, JOB_ID)(Effect.never);
  return yield* Fiber.await(fiber);
});

describe("timedOutMessage", () => {
  it("names the expiry in seconds, then minutes", () => {
    expect(timedOutMessage(1000)).toBe("Timed out after 1s");
    expect(timedOutMessage(60_000)).toBe("Timed out after 1m");
    expect(timedOutMessage(150_000)).toBe("Timed out after 2m 30s");
  });

  it("falls back to a fixed text and a fixed abort text", () => {
    expect(abortFailureMessage("timeout", undefined)).toBe("Timed out");
    expect(abortFailureMessage("timeout", "Timed out after 1s")).toBe(
      "Timed out after 1s"
    );
    expect(abortFailureMessage("cancel", "ignored")).toBe("aborted");
  });
});

describe("interruptOnQueueSignal", () => {
  it.effect("interrupts the Job fiber with the timeout reason on expiry", () =>
    Effect.gen(function* expiryGen() {
      const fibers = yield* JobFibers;
      const controller = new AbortController();
      const running = yield* Effect.forkChild(
        interruptOnQueueSignal(
          { signal: controller.signal, expireInSeconds: 30 },
          JOB_ID,
          runInMap
        )
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust("30 seconds");
      controller.abort();
      const exit = yield* Fiber.join(running);
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
        true
      );
      expect(fibers.peekReason(JOB_ID)).toBe("timeout");
      expect(fibers.peekDetail(JOB_ID)).toBe("Timed out after 30s");
    }).pipe(Effect.provide(JobFibers.layer), Effect.scoped)
  );

  it.effect("an abort before the expiry is a cancel, not a timeout", () =>
    Effect.gen(function* earlyAbortGen() {
      const fibers = yield* JobFibers;
      const controller = new AbortController();
      const running = yield* Effect.forkChild(
        interruptOnQueueSignal(
          { signal: controller.signal, expireInSeconds: 30 },
          JOB_ID,
          runInMap
        )
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust("2 seconds");
      controller.abort();
      yield* Fiber.join(running);
      expect(fibers.peekReason(JOB_ID)).toBe("cancel");
      expect(fibers.peekDetail(JOB_ID)).toBeUndefined();
    }).pipe(Effect.provide(JobFibers.layer), Effect.scoped)
  );

  it.effect("leaves a Job that finishes before any abort untouched", () =>
    Effect.gen(function* normalGen() {
      const fibers = yield* JobFibers;
      const controller = new AbortController();
      const value = yield* interruptOnQueueSignal(
        { signal: controller.signal, expireInSeconds: 30 },
        JOB_ID,
        Effect.succeed("done")
      );
      // pg-boss aborts the signal after every handler, too: nothing listens now.
      controller.abort();
      yield* Effect.yieldNow;
      expect(value).toBe("done");
      expect(fibers.peekReason(JOB_ID)).toBeUndefined();
    }).pipe(Effect.provide(JobFibers.layer), Effect.scoped)
  );
});
