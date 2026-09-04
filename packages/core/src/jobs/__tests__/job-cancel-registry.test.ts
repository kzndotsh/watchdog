import { Effect, Fiber, FiberMap } from "effect";
import { describe, expect, it } from "vitest";

import { JobFibers } from "../job-fibers";

describe("job fiber cancel", () => {
  it("tracks a fiber and interrupts it as cancel", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* jobCancelGen() {
          const fibers = yield* JobFibers;
          const fiber = yield* FiberMap.run(
            fibers.map,
            "job-cancel-test"
          )(Effect.never).pipe(Effect.tap(() => Effect.yieldNow));
          expect(fibers.listIds()).toContain("job-cancel-test");
          expect(yield* fibers.abort("job-cancel-test", "cancel")).toBe(true);
          expect(fibers.peekReason("job-cancel-test")).toBe("cancel");
          yield* Fiber.join(fiber).pipe(Effect.catchCause(() => Effect.void));
          expect(yield* fibers.abort("job-cancel-test", "timeout")).toBe(false);
        })
      ).pipe(Effect.provide(JobFibers.layer))
    );
  });
});
