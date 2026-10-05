import { Effect, Layer } from "effect";

import { blobStoreLayer, type BlobStore } from "./blob-store";
import { Db } from "./db-service";
import type { DomainTag } from "./tagged-errors";
import { vaultLayer, type Vault } from "./vault";

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
 * The services `runDomain` provides: the live `Db`, `Vault` and `BlobStore`
 * Layers. Both extras are cheap per call (the vault Layer only captures `Db`,
 * the blob Layer only builds an `S3Client`, destroyed when the call ends).
 * Stateful services (`JobQueue`) are not in here: pass them through
 * `runDomainWith`.
 */
const domainLive = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  blobStoreLayer
);

/**
 * Run a domain Effect to a Promise with the live `Db`, `Vault` and `BlobStore`
 * Layers. A typed failure rejects with the tagged error itself (not wrapped), so callers narrow with
 * `instanceof` or `_tag`. Effects with R = never run unchanged.
 */
export function runDomain<A>(
  effect: Effect.Effect<A, DomainTag, Db | BlobStore | Vault>
): Promise<A> {
  return runDomainWith(domainLive)(effect);
}
