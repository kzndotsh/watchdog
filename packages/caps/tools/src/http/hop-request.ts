import { Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { abortWhen } from "./abort-when";
import { withOutboundInit } from "./http-client-layer";
import { transportFailure } from "./transport-error";

/** Status line and headers of one outbound hop (the body is never kept). */
export type HopResponse = {
  readonly status: number;
  readonly headers: Headers;
  /** The URL the response came from; empty when the transport reports none. */
  readonly url: string;
};

type HopRequest = {
  readonly method: "HEAD" | "GET";
  readonly userAgent: string;
  /** `manual` returns a 3xx unfollowed; default follows redirects inside the outbound client. */
  readonly redirect?: "manual";
};

/** The tools tag behind a failed hop: the typed outbound failure, else mapped by class. */
function toToolsTag(cause: unknown): ToolsTag {
  return mapToolsCatch(transportFailure(cause));
}

/**
 * One status-and-headers request through the `HttpClient` (so through the outbound
 * client). It runs under the calling fiber: interrupting the fiber, or aborting
 * `signal` (the Cap's own), aborts the request in flight and releases its
 * connection. Fails with a tools tag; the body is read to the one-byte cap and
 * dropped.
 */
export function hopRequestEffect(
  url: string,
  request: HopRequest,
  signal: AbortSignal
): Effect.Effect<HopResponse, ToolsTag, HttpClient.HttpClient> {
  const { method, userAgent, redirect } = request;
  return Effect.gen(function* hopRequestGen() {
    const client = yield* HttpClient.HttpClient;
    const res = yield* withOutboundInit(
      client.execute(
        HttpClientRequest.make(method)(url, {
          headers:
            method === "GET"
              ? {
                  "User-Agent": userAgent,
                  Accept: "*/*",
                  Range: "bytes=0-0",
                }
              : { "User-Agent": userAgent, Accept: "*/*" },
        })
      ),
      {
        limits: { maxBytes: 1, truncate: true },
        ...(redirect === undefined ? {} : { redirect }),
      }
    );
    // Only the status line and headers matter: release the connection.
    yield* res.arrayBuffer;
    return {
      status: res.status,
      headers: new Headers(res.headers),
      url: res.url,
    };
  }).pipe(Effect.mapError(toToolsTag), Effect.raceFirst(abortWhen(signal)));
}
