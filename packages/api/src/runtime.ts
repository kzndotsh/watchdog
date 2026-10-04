import { Effect, Layer, ManagedRuntime } from "effect";

import type { DomainTag } from "@watchdog/core/errors";

import { toOrpcError } from "./map-domain-error";

/** Empty composition root until the ADR-0002 phases land: domain Effects use `tryDb` / module functions. */
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
