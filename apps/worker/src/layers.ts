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

import { workerShutdownLayer, type WorkerShutdown } from "./shutdown";

/**
 * Provide the worker's services. Layers close innermost first: after the boot
 * scope closes, the worker queue drains pg-boss (graceful `boss.stop`, so
 * in-flight Cap Jobs finish), and only then does `JobFibers` interrupt what is
 * left, then `Db`, the vault and the blob store (the `S3Client` is destroyed). Keep the queue Layer innermost. `main.ts` passes
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
    | JobFibers
    | JobQueue
    | JobQueueWorker
    | WorkerShutdown
  >,
  queueLayer: Layer.Layer<JobQueue | JobQueueWorker, LE>
): Effect.Effect<A, E | LE> {
  return effect.pipe(
    Effect.provide(queueLayer),
    Effect.provide(JobFibers.layer),
    Effect.provide(
      Layer.mergeAll(Layer.provideMerge(vaultLayer, Db.layer), blobStoreLayer)
    ),
    // Outermost: signal listeners exist from process start and outlive the drain.
    Effect.provide(workerShutdownLayer)
  );
}
