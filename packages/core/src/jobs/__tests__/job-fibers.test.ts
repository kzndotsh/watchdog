import { Effect, Fiber, FiberMap } from "effect";
import { describe, expect, it } from "vitest";

import { JobFibers } from "../job-fibers";

describe("JobFibers layer", () => {
  it("scoped layer owns the FiberMap and abort reasons", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* jobFibersLayerGen() {
          const fibers = yield* JobFibers;
          const fiber = yield* FiberMap.run(
            fibers.map,
            "layer-job"
          )(Effect.never);
          expect(fibers.listIds()).toContain("layer-job");
          expect(yield* fibers.abort("layer-job", "cancel")).toBe(true);
          expect(fibers.peekReason("layer-job")).toBe("cancel");
          yield* Fiber.join(fiber).pipe(Effect.catchCause(() => Effect.void));
          expect(yield* fibers.abort("layer-job", "timeout")).toBe(false);
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });

  it("keeps the first reason and detail when two aborts race", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* raceAbortsGen() {
          const fibers = yield* JobFibers;
          yield* FiberMap.run(fibers.map, "race-abort")(Effect.never);
          yield* Effect.all(
            [
              fibers.abort("race-abort", "timeout", "Timed out after 1s"),
              fibers.abort("race-abort", "cancel", "other"),
            ],
            { concurrency: "unbounded" }
          );
          expect(fibers.peekReason("race-abort")).toBe("timeout");
          expect(fibers.peekDetail("race-abort")).toBe("Timed out after 1s");
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });

  it("setReason does not overwrite an existing abort reason", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* setReasonNoOverwriteGen() {
          const fibers = yield* JobFibers;
          fibers.setReason("race-job", "cancel");
          fibers.setReason("race-job", "timeout");
          expect(fibers.peekReason("race-job")).toBe("cancel");
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });
});
