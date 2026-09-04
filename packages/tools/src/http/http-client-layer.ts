import { Layer } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/unstable/http";

/**
 * One Fetch-backed HttpClient for tools JSON/bytes Effects.
 * Provide at Cap `run` / collect / worker / vitest roots — not per request.
 * Fetch resolves `globalThis.fetch` at call time so `vi.stubGlobal("fetch")` works.
 */
export const toolsHttpClientLayer: Layer.Layer<HttpClient.HttpClient> =
  FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch, (url, init) =>
        globalThis.fetch(url, init)
      )
    )
  );
