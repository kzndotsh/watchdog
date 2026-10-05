import { Effect, Layer } from "effect";

import { blobStoreLayer, type BlobStore } from "./blob-store";
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
 * The services `runDomain` provides: the live `Db` and `BlobStore` Layers. The
 * blob Layer only builds an `S3Client` (no connection, destroyed when the call
 * ends), so it stays cheap per call. Stateful services (`JobQueue`) are not in
 * here: pass them through `runDomainWith`.
 */
const domainLive = Layer.mergeAll(Db.layer, blobStoreLayer);

/**
 * Run a domain Effect to a Promise with the live `Db` and `BlobStore` Layers.
 * A typed failure
 * rejects with the tagged error itself (not wrapped), so callers narrow with
 * `instanceof` or `_tag`. Effects with R = never run unchanged.
 */
export function runDomain<A>(
  effect: Effect.Effect<A, DomainTag, Db | BlobStore>
): Promise<A> {
  return runDomainWith(domainLive)(effect);
}
