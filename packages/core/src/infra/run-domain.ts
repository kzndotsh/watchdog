import { Effect } from "effect";

import type { DomainTag } from "./tagged-errors";

/**
 * Run a domain Effect to a Promise. A typed failure rejects with the tagged
 * error itself (not wrapped), so callers narrow with `instanceof` or `_tag`.
 */
export function runDomain<A>(effect: Effect.Effect<A, DomainTag>): Promise<A> {
  return Effect.runPromise(effect);
}
