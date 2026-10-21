import { Effect, Layer } from "effect";

import {
  blobStoreLayer,
  type BlobStore,
  Db,
  vaultLayer,
  type Vault,
  JobFibers,
  type JobQueue,
  type JobQueueWorker,
} from "@watchdog/core/worker";
import { outboundClientLayer, type OutboundClient } from "@watchdog/tools/http";

import { workerShutdownLayer, type WorkerShutdown } from "./shutdown";

/**
 * Provide the worker's services. Layers close innermost first: after the boot
 * scope closes, the worker queue drains pg-boss (graceful `boss.stop`, so
 * in-flight Cap Jobs finish), and only then does `JobFibers` interrupt what is
 * left, then the vault, the blob store (the `S3Client` is destroyed), the outbound client (its connection pools close, awaited, after the
 * interrupted Jobs have aborted their in-flight requests) and `Db.owned`, which
 * ends the Postgres pool last: the queue drain and the `JobFibers` release
 * both write Job status (the lifecycle module), so the pool must outlive them.
 * Keep the queue Layer innermost and `Db.owned` outside `JobFibers`. `main.ts` passes
 * `jobQueueWorkerLayer`; tests pass a fake driver's Layer
 * (`makeJobQueueLayers`).
 */
export function provideWorkerLayers<A, E, LE>(
  effect: Effect.Effect<
    A,
    E,
    | Db
    | BlobStore
    | Vault
    | OutboundClient
    | JobFibers
    | JobQueue
    | JobQueueWorker
    | WorkerShutdown
  >,
  queueLayer: Layer.Layer<JobQueue | JobQueueWorker, LE>,
  // The pool owner; tests pass a recording one (`makeOwnedDb`) to prove the release order.
  dbLayer: Layer.Layer<Db> = Db.owned
): Effect.Effect<A, E | LE> {
  return effect.pipe(
    Effect.provide(queueLayer),
    Effect.provide(JobFibers.layer),
    Effect.provide(
      Layer.mergeAll(
        Layer.provideMerge(vaultLayer, dbLayer),
        blobStoreLayer,
        outboundClientLayer
      )
    ),
    // Outermost: signal listeners exist from process start and outlive the drain.
    Effect.provide(workerShutdownLayer)
  );
}
