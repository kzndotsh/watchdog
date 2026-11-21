import { Clock, Effect } from "effect";

/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;

export const nowMillisEffect: Effect.Effect<number> = Clock.currentTimeMillis;

export const nowDateEffect: Effect.Effect<Date> = Clock.currentTimeMillis.pipe(
  Effect.map((ms) => new Date(ms))
);

export const nowIsoStringEffect: Effect.Effect<string> =
  Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms).toISOString()));
