import { Effect, Layer, ManagedRuntime } from "effect";

import type { DomainTag } from "@watchdog/core";

import { toOrpcError } from "./map-domain-error";

/** Empty composition root — domain Effects use `tryDb` / module functions, not Layers. */
export const AppLive = Layer.empty;

export const appRuntime = ManagedRuntime.make(AppLive);

/**
 * Run an application Effect. Maps `DomainTag` in `E` to oRPC errors before
 * `runPromise`, so handlers never see thrown `DomainError`.
 */
export async function runApp<A>(
  effect: Effect.Effect<A, DomainTag>
): Promise<A> {
  return appRuntime.runPromise(effect.pipe(Effect.mapError(toOrpcError)));
}
