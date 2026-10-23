import { Duration, Effect, Fiber } from "effect";

import { timedOutMessage, type StopSlot } from "./stop-slot";

/**
 * Run `effect` under the Job's abort timer: when `timeoutMs` passes first, the timer offers
 * `cap_timeout` to the attempt's stop slot, then interrupts the fiber that called this. The
 * timer is stopped when `effect` ends either way.
 */
export function underJobTimer<A, E, R>(
  timeoutMs: number,
  stop: StopSlot,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  return Effect.gen(function* underJobTimerGen() {
    const parent = yield* Effect.fiber;
    const sleeper = yield* Effect.forkChild(
      Effect.gen(function* timeoutSleeper() {
        yield* Effect.sleep(Duration.millis(timeoutMs));
        yield* stop.offer({
          cause: "cap_timeout",
          detail: timedOutMessage(timeoutMs),
        });
        yield* Fiber.interrupt(parent);
      })
    );
    return yield* effect.pipe(Effect.ensuring(Fiber.interrupt(sleeper)));
  });
}
