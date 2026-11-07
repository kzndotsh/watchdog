import type { Layer } from "effect";
import { Effect } from "effect";

import type { BlobStore } from "@watchdog/core/blob";
import { coreServicesLayer, Db } from "@watchdog/core/infra";
import {
  JobFibers,
  type JobQueue,
  type JobQueueWorker,
} from "@watchdog/core/jobs";
import type { Vault } from "@watchdog/core/vault";
import type { OutboundClient } from "@watchdog/tools/http";

import { workerShutdownLayer, type WorkerShutdown } from "./shutdown";

/**
 * Provide the worker's services: core's `coreServicesLayer` over the pool owner
 * (its docs hold the release order: queue drain, `JobFibers`, the services, the
 * pool last) plus the worker's role Layers. Keep the queue Layer innermost and
 * the pool owner outside `JobFibers`. `main.ts` passes `jobQueueWorkerLayer`;
 * tests pass a fake driver's Layer (`makeJobQueueLayers`).
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
  // The pool owner; tests pass a recording one to prove the release order.
  dbLayer: Layer.Layer<Db> = Db.owned
): Effect.Effect<A, E | LE> {
  return effect.pipe(
    Effect.provide(queueLayer),
    Effect.provide(JobFibers.layer),
    Effect.provide(coreServicesLayer(dbLayer)),
    // Outermost: signal listeners exist from process start and outlive the drain.
    Effect.provide(workerShutdownLayer)
  );
}
