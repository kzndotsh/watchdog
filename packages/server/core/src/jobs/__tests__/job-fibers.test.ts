import { Effect, Fiber, FiberMap } from "effect";
import { describe, expect, it } from "vitest";

import { JobFibers } from "../job-fibers";

describe("JobFibers layer", () => {
  it("scoped layer owns the FiberMap and aborts a tracked fiber with a stop", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* jobFibersLayerGen() {
          const fibers = yield* JobFibers;
          const fiber = yield* FiberMap.run(
            fibers.map,
            "layer-job"
          )(Effect.never);
          expect(fibers.listIds()).toContain("layer-job");
          expect(
            yield* fibers.abort("layer-job", { cause: "user_cancelled" })
          ).toBe(true);
          expect(yield* fibers.attemptFor("layer-job").stop.peek).toEqual({
            cause: "user_cancelled",
          });
          yield* Fiber.join(fiber).pipe(Effect.catchCause(() => Effect.void));
          expect(
            yield* fibers.abort("layer-job", { cause: "cap_timeout" })
          ).toBe(false);
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });

  it("keeps the first stop and its detail when two aborts race", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* raceAbortsGen() {
          const fibers = yield* JobFibers;
          yield* FiberMap.run(fibers.map, "race-abort")(Effect.never);
          yield* Effect.all(
            [
              fibers.abort("race-abort", {
                cause: "cap_timeout",
                detail: "Timed out after 1s",
              }),
              fibers.abort("race-abort", {
                cause: "queue_aborted",
                detail: "other",
              }),
            ],
            { concurrency: "unbounded" }
          );
          expect(yield* fibers.attemptFor("race-abort").stop.peek).toEqual({
            cause: "cap_timeout",
            detail: "Timed out after 1s",
          });
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });

  it("starts the next attempt with an empty stop slot once the attempt is cleared", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* clearAttemptGen() {
          const fibers = yield* JobFibers;
          yield* fibers.attemptFor("again").stop.offer({
            cause: "queue_aborted",
          });
          fibers.clearAttempt("again");
          expect(yield* fibers.attemptFor("again").stop.peek).toBeNull();
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });
});
