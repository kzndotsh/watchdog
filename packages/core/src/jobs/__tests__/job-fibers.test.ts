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
});
