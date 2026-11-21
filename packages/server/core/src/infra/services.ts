import { Layer } from "effect";

import { outboundClientLayer } from "@watchdog/tools/http";

import { blobStoreLayer } from "./blob-store";
import type { Db } from "./db-service";
import { vaultLayer } from "./vault";

/**
 * The services every process shares, over a given `Db`: `Vault` (credential
 * access over `Db`), `BlobStore` (one `S3Client`, destroyed on release) and
 * `OutboundClient` (the outbound connection pools, awaited closed on release).
 * `Db` stays in the output (`provideMerge`), so a process adds its role Layers
 * (the API's queue producer and `ActivityTailer`, the worker's queue,
 * `JobFibers` and shutdown) around this one and never merges these by hand.
 * Adding a core service is one edit here.
 *
 * Lifetime and release order (the one place it is written down). Layers close
 * innermost first, so a Layer provided outside another outlives it:
 *
 *   1. role Layers: the worker queue drains pg-boss (graceful `boss.stop`, so
 *      in-flight Cap Jobs finish; keep it innermost), then `JobFibers`
 *      interrupts the Jobs still running.
 *   2. these services: the vault, the blob store, the outbound client (its pools
 *      close after the interrupted Jobs have aborted their in-flight requests).
 *   3. the `Db` Layer last. `Db.owned` ends the Postgres pool, and the queue
 *      drain and the `JobFibers` release both write Job status (the lifecycle
 *      module), so the pool must outlive them. `Db.layer` borrows the pool and
 *      ends nothing (`runDomain`, tests).
 *
 * `runDomain` builds this Layer per call over `Db.layer`: the services are
 * cheap (the outbound pools open on the first request, the S3 client only on
 * construction) and are released when the call returns, so a fiber that
 * outlives the call must not use them (see `run-domain.ts`). The worker's
 * `provideWorkerLayers` and the API's `makeAppLive` pass `Db.owned`.
 * `pool-shutdown.test.ts` (worker) proves the order.
 */
export function coreServicesLayer<E>(db: Layer.Layer<Db, E>) {
  return Layer.provideMerge(
    Layer.mergeAll(vaultLayer, blobStoreLayer, outboundClientLayer),
    db
  );
}
