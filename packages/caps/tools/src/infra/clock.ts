import { Clock, Effect } from "effect";

export const nowIsoStringEffect: Effect.Effect<string> =
  Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms).toISOString()));
