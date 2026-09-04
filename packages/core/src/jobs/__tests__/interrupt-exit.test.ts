import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, FiberMap } from "effect";
import { TestClock } from "effect/testing";

import { JobFibers } from "../job-fibers";

/**
 * Effect 4 sticky interrupt: catchCause "recovery" does not become a Success
 * Exit when the fiber was interrupted. Job runner must classify via Fiber.await
 * + onExitIf, not catchCause alone.
 */
describe("Effect interrupt Exit", () => {
  it.effect("catchCause recovery still exits as interrupt", () =>
    Effect.gen(function* stickyInterruptGen() {
      const work = Effect.sleep("5 seconds").pipe(
        Effect.catchCause(() => Effect.succeed("recovered"))
      );
      const fiber = yield* Effect.forkChild(work);
      yield* TestClock.adjust("20 millis");
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      }
    })
  );

  it.effect("onExitIf runs for interrupt-only exits", () =>
    Effect.gen(function* onExitIfInterruptGen() {
      let sawInterrupt = false;
      const work = Effect.sleep("5 seconds").pipe(
        Effect.onExitIf(
          (exit) => Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
          () =>
            Effect.sync(() => {
              sawInterrupt = true;
            })
        )
      );
      const fiber = yield* Effect.forkChild(work);
      yield* TestClock.adjust("20 millis");
      yield* Fiber.interrupt(fiber);
      yield* Fiber.await(fiber);
      expect(sawInterrupt).toBe(true);
    })
  );

  it.effect(
    "JobFibers.abort keeps peekReason until clear after Fiber.await",
    () =>
      Effect.scoped(
        Effect.gen(function* abortPeekReasonGen() {
          const fibers = yield* JobFibers;
          const fiber = yield* FiberMap.run(
            fibers.map,
            "timeout-job"
          )(Effect.never);
          expect(yield* fibers.abort("timeout-job", "timeout")).toBe(true);
          expect(fibers.peekReason("timeout-job")).toBe("timeout");
          const exit = yield* Fiber.await(fiber);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
          }
          expect(fibers.peekReason("timeout-job")).toBe("timeout");
          fibers.clearReason("timeout-job");
          expect(fibers.peekReason("timeout-job")).toBeUndefined();
        })
      ).pipe(Effect.provide(JobFibers.layer))
  );
});
