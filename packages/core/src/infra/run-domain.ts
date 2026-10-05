import { Effect, type Layer } from "effect";

import { Db } from "./db-service";
import type { DomainTag } from "./tagged-errors";

/**
 * `runDomain` with an override Layer, for tests: `runDomainWith(Db.layerOf(spy))(e)`
 * or `runDomainWith(Layer.succeed(Db, stub))(e)`.
 * The Layer is built per call, so keep it cheap (no scoped resources).
 */
export function runDomainWith<ROut>(layer: Layer.Layer<ROut>) {
  return <A>(effect: Effect.Effect<A, DomainTag, ROut>): Promise<A> =>
    Effect.runPromise(Effect.provide(effect, layer));
}

/**
 * Run a domain Effect to a Promise with the live `Db` Layer. A typed failure
 * rejects with the tagged error itself (not wrapped), so callers narrow with
 * `instanceof` or `_tag`. Effects with R = never run unchanged.
 */
export function runDomain<A>(
  effect: Effect.Effect<A, DomainTag, Db>
): Promise<A> {
  return runDomainWith(Db.layer)(effect);
}
