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
 * `safeFetch` calls `globalThis.fetch` at call time, so `vi.stubGlobal("fetch")`
 * and msw still intercept in tests.
 */
export const toolsHttpClientLayer: Layer.Layer<HttpClient.HttpClient> =
  FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, safeFetch))
  );

/** Overrides the byte limit, timeout, redirect count or truncation of the requests inside `effect`. */
export function withOutboundLimits<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  limits: OutboundLimits
): Effect.Effect<A, E, R> {
  const init: SafeFetchInit = { limits };
  return effect.pipe(Effect.provideService(FetchHttpClient.RequestInit, init));
}
