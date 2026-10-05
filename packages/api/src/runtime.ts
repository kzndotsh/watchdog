import { Effect, Layer, ManagedRuntime } from "effect";

import type { BlobStore } from "@watchdog/core/blob";
import { blobStoreLayer } from "@watchdog/core/blob";
import type { DomainTag } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/infra";
import type { JobQueue } from "@watchdog/core/jobs";
import { jobQueueProducerLayer } from "@watchdog/core/jobs";
import type { Vault } from "@watchdog/core/vault";
import { vaultLayer } from "@watchdog/core/vault";

import { toOrpcError } from "./map-domain-error";

/**
 * Composition root (ADR-0002 phases 2-3): the live `Db` Layer, the
 * producer-role `JobQueue` Layer (the web/API process only enqueues; the
 * worker composes the worker role instead), the `Vault` Layer (credential
 * access over `Db` and the vault crypto) and the `BlobStore` Layer (one
 * `S3Client`, destroyed when the runtime is disposed). The producer starts
 * pg-boss lazily on the first enqueue, so building `AppLive` never touches the
 * database. The vault Layer is the live credential reader over `Db`.
 */
export const AppLive = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  jobQueueProducerLayer,
  blobStoreLayer
);

export const appRuntime = ManagedRuntime.make(AppLive);

/**
 * Run an application Effect. Maps `DomainTag` in `E` to oRPC errors before
 * `runPromise`, so handlers only see transport errors. Services come from
 * `AppLive`.
 */
export async function runApp<A>(
  effect: Effect.Effect<A, DomainTag, Db | JobQueue | BlobStore | Vault>
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
