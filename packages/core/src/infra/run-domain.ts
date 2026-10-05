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
 * the blob Layer only builds an `S3Client`).
 *
 * Lifetime: they are built per call and the S3 client is destroyed when the
 * call returns, so a fiber the effect forks that outlives the call must not use
 * them. The one such fiber, the export write forked by Case update via
 * `forkDetach`, provides its own `Db` / `BlobStore` (`ExportWriteServices` in
 * `export-sync.ts`), so it is independent of this call.
 *
 * `vaultLayer` captures the `Db` it is built over, so under
 * `runDomainWith(Db.layerOf(tx))` a live vault still uses the pool: tests compose
 * `Layer.provideMerge(vaultLayer, Db.layerOf(tx))` or use `fakeVault`.
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
