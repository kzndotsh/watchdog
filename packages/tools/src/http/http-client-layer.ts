import { Effect, Layer } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";

import {
  safeFetch,
  type OutboundLimits,
  type SafeFetchInit,
} from "./safe-fetch";

/**
 * The one HttpClient of Caps and tools: every request goes through `safeFetch`
 * (resolved-address validation, manual redirects re-validated per hop, streamed
 * byte cap, per-call timeout, optional egress proxy). Provide it once at the
 * Cap `run` / collect / worker / vitest root, not per request.
 * `safeFetch` sends with `fetch` from the same `undici` package as its dispatcher;
 * under Vitest `scripts/vitest/undici-fetch-seam.ts` routes that call to the global
 * `fetch` so MSW and `vi.stubGlobal("fetch")` keep intercepting.
 */
export const toolsHttpClientLayer: Layer.Layer<HttpClient.HttpClient> =
  FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
        typeof input === "string" || input instanceof URL
          ? safeFetch(input, init)
          : Promise.reject(
              new TypeError(
                "safeFetch takes a URL string or URL, not a Request"
              )
            )
      )
    )
  );

/** Overrides the byte limit, timeout, redirect count or truncation of the requests inside `effect`. */
export function withOutboundLimits<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  limits: OutboundLimits
): Effect.Effect<A, E, R> {
  const init: SafeFetchInit = { limits };
  return effect.pipe(Effect.provideService(FetchHttpClient.RequestInit, init));
}
