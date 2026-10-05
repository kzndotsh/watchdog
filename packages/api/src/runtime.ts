import { Effect, Layer, ManagedRuntime } from "effect";

import type { DomainTag } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/infra";
import type { JobQueue } from "@watchdog/core/jobs";
import { jobQueueProducerLayer } from "@watchdog/core/jobs";

import { toOrpcError } from "./map-domain-error";

/**
 * Composition root (ADR-0002 phases 2-3): the live `Db` Layer and the
 * producer-role `JobQueue` Layer (the web/API process only enqueues; the
 * worker composes the worker role instead). The producer starts pg-boss lazily
 * on the first enqueue, so building `AppLive` never touches the database.
 * Later phases merge the blob and vault Layers here.
 */
export const AppLive = Layer.mergeAll(Db.layer, jobQueueProducerLayer);

export const appRuntime = ManagedRuntime.make(AppLive);

/**
 * Run an application Effect. Maps `DomainTag` in `E` to oRPC errors before
 * `runPromise`, so handlers only see transport errors. Services come from
 * `AppLive`.
 */
export async function runApp<A>(
  effect: Effect.Effect<A, DomainTag, Db | JobQueue>
): Promise<A> {
  return appRuntime.runPromise(effect.pipe(Effect.mapError(toOrpcError)));
}

/**
 * `runApp` with an override Layer for tests, e.g.
 * `runAppWith(Db.layerOf(spy))(effect)`. The override wins over `AppLive`.
 */
export function runAppWith<ROut>(layer: Layer.Layer<ROut>) {
  return async <A>(effect: Effect.Effect<A, DomainTag, ROut>): Promise<A> =>
    appRuntime.runPromise(
      effect.pipe(Effect.mapError(toOrpcError), Effect.provide(layer))
    );
}
