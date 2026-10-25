import { Context, Effect, Layer } from "effect";

import {
  createOutboundTransport,
  type SafeFetch,
  type SafeFetchDeps,
} from "./safe-fetch";

/**
 * The hardened outbound `fetch` (see `createOutboundTransport`) as a service. Its
 * connection pools (the undici `Agent`, the optional egress `ProxyAgent`) live exactly
 * as long as the scope of the Layer that built it.
 */
export class OutboundClient extends Context.Service<
  OutboundClient,
  {
    readonly fetch: SafeFetch;
    /** The private-origin door, handed only to the Job's `Egress` (see `OutboundTransport`). */
    readonly fetchPrivateOrigin: SafeFetch;
  }
>()("@watchdog/tools/http/OutboundClient") {}

/**
 * Builds an `OutboundClient` whose pools close when the Layer's scope closes: the
 * release awaits every pool (in-flight requests get a short grace, the rest are
 * aborted), so nothing is closed in the background. `deps` is for tests.
 */
export function outboundClientLayerWith(
  deps: SafeFetchDeps = {}
): Layer.Layer<OutboundClient> {
  return Layer.effect(
    OutboundClient,
    Effect.acquireRelease(
      Effect.sync(() => createOutboundTransport(deps)),
      (transport) => Effect.promise(async () => transport.close())
    ).pipe(
      Effect.map((transport) =>
        OutboundClient.of({
          fetch: transport.fetch,
          fetchPrivateOrigin: transport.fetchPrivateOrigin,
        })
      )
    )
  );
}

/**
 * The pools of the live process, closed on shutdown. Provide it once at the
 * runtime root: the worker (`provideWorkerLayers`) and the web server's
 * `AppLive`. Pools are created on the first request, so building it opens nothing.
 */
export const outboundClientLayer: Layer.Layer<OutboundClient> =
  outboundClientLayerWith();
