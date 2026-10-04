import { Effect, type Layer, ManagedRuntime } from "effect";

import type { DomainTag } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/infra";

import { toOrpcError } from "./map-domain-error";

/**
 * Composition root (ADR-0002 phase 2): the live `Db` Layer. Later phases merge
 * the blob, queue and vault Layers here.
 */
export const AppLive = Db.layer;

export const appRuntime = ManagedRuntime.make(AppLive);

/**
 * Run an application Effect. Maps `DomainTag` in `E` to oRPC errors before
 * `runPromise`, so handlers only see transport errors. Services come from
 * `AppLive`.
 */
export async function runApp<A>(
  effect: Effect.Effect<A, DomainTag, Db>
): Promise<A> {
  return appRuntime.runPromise(effect.pipe(Effect.mapError(toOrpcError)));
}

/**
 * `runApp` with an override Layer for tests, e.g.
 * `runAppWith(TestDbLayer)(effect)`. The override wins over `AppLive`.
 */
export function runAppWith<ROut>(layer: Layer.Layer<ROut>) {
  return async <A>(effect: Effect.Effect<A, DomainTag, ROut>): Promise<A> =>
    appRuntime.runPromise(
      effect.pipe(Effect.mapError(toOrpcError), Effect.provide(layer))
    );
}
