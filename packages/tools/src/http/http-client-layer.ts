import { Effect, Layer } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";

import { OutboundClient, outboundClientLayer } from "./outbound-client";
import type { OutboundLimits, SafeFetchInit } from "./safe-fetch";

/**
 * The one HttpClient of Caps and tools, over the scoped `OutboundClient`: every
 * request goes through the hardened `fetch` (resolved-address validation, manual
 * redirects re-validated per hop, streamed byte cap, per-call timeout, optional
 * egress proxy) and runs under the requesting fiber, so interrupting the fiber
 * aborts the request in flight. Stateless: it owns no pool, so the Cap collect
 * stage provides it per Job on top of the runtime's `OutboundClient`.
 * The client sends with `fetch` from the same `undici` package as its dispatcher;
 * under Vitest `scripts/vitest/undici-fetch-seam.ts` routes that call to the global
 * `fetch` so MSW and `vi.stubGlobal("fetch")` keep intercepting.
 */
export const httpClientLayer: Layer.Layer<
  HttpClient.HttpClient,
  never,
  OutboundClient
> = Layer.unwrap(
  Effect.gen(function* httpClientLayerGen() {
    const outbound = yield* OutboundClient;
    return FetchHttpClient.layer.pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
          typeof input === "string" || input instanceof URL
            ? outbound.fetch(input, init)
            : Promise.reject(
                new TypeError(
                  "The outbound client takes a URL string or URL, not a Request"
                )
              )
        )
      )
    );
  })
);

/**
 * `httpClientLayer` with its own pools, closed when the Layer's scope does (the end
 * of the `Effect.provide`d effect). For tests, the CLI and one-shot scripts; a
 * long-lived runtime provides `outboundClientLayer` once and `httpClientLayer` on top.
 */
export const toolsHttpClientLayer: Layer.Layer<HttpClient.HttpClient> =
  httpClientLayer.pipe(Layer.provide(outboundClientLayer));

/** Sets the `fetch` options (`redirect`, `limits`) of the requests inside `effect`. */
export function withOutboundInit<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  init: SafeFetchInit
): Effect.Effect<A, E, R> {
  return effect.pipe(Effect.provideService(FetchHttpClient.RequestInit, init));
}

/** Overrides the byte limit, timeout, redirect count or truncation of the requests inside `effect`. */
export function withOutboundLimits<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  limits: OutboundLimits
): Effect.Effect<A, E, R> {
  return withOutboundInit(effect, { limits });
}
