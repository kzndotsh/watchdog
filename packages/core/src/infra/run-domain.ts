import { Effect } from "effect";

import { toDomainError, type DomainTag } from "./tagged-errors";

export function runDomain<A>(effect: Effect.Effect<A, DomainTag>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.mapError(toDomainError)));
}
