import { Cause, Effect, Exit } from "effect";
import { HttpClient, HttpClientError } from "effect/http";

import { GENERIC_REQUEST_FAILURE } from "../errors/tagged-errors";
import { errorMessage } from "../errors/vendor-errors";
import { abortWhen } from "./abort-when";
import { withOutboundLimits } from "./http-client-layer";
import { assertHttpUrlScheme, normalizeHttpUrl } from "./normalize-http-url";
import { transportFailure } from "./transport-error";

export type FetchBytesOptions = {
  /** User-Agent header (Cap OPSEC policy — pass from Cap, never hardcode Cap id here). */
  userAgent: string;
  /** Truncate response body to this many bytes. */
  maxBytes: number;
  /** Accept header. */
  accept?: string;
  headers?: Record<string, string>;
};

export type FetchBytesResult = {
  ok: boolean;
  status: number;
  bytes: Uint8Array;
  contentType: string | null;
  markdownTokensHint?: number;
  finalUrl: string;
  error?: string;
};

function fetchBytesFailure(url: string, error: unknown): FetchBytesResult {
  return {
    ok: false,
    status: 0,
    bytes: new Uint8Array(),
    contentType: null,
    finalUrl: url,
    error: errorMessage(error),
  };
}

function mapFetchBytesFailure(url: string) {
  return (error: unknown) => {
    const failure = transportFailure(error);
    // An untyped transport failure reads the same as a name that resolved to a
    // refused address, so the text does not reveal how a name resolves.
    const reported = HttpClientError.isHttpClientError(failure)
      ? new Error(GENERIC_REQUEST_FAILURE)
      : failure;
    return Effect.succeed(fetchBytesFailure(url, reported));
  };
}

function resolveFetchTarget(
  raw: string
): { url: string } | { error: string; url: string } {
  try {
    assertHttpUrlScheme(raw);
    return { url: normalizeHttpUrl(raw) };
  } catch (error) {
    return { error: errorMessage(error), url: raw };
  }
}

function fetchBytesBody(
  url: string,
  options: FetchBytesOptions
): Effect.Effect<FetchBytesResult, never, HttpClient.HttpClient> {
  const accept = options.accept ?? "*/*";
  return Effect.gen(function* fetchBytesGen() {
    const client = yield* HttpClient.HttpClient;
    const res = yield* withOutboundLimits(
      client.get(url, {
        headers: {
          Accept: accept,
          "User-Agent": options.userAgent,
          ...options.headers,
        },
      }),
      { maxBytes: options.maxBytes, truncate: true }
    );
    const buffer = yield* res.arrayBuffer;
    const truncated = new Uint8Array(buffer);
    const tokenHeader = res.headers["x-markdown-tokens"];
    const markdownTokensHint =
      tokenHeader !== undefined && tokenHeader !== ""
        ? Math.trunc(Number(tokenHeader))
        : undefined;
    const finalUrl = res.url === "" ? url : res.url;
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      bytes: truncated,
      contentType: res.headers["content-type"] ?? null,
      ...(Number.isFinite(markdownTokensHint) ? { markdownTokensHint } : {}),
      finalUrl,
      ...(res.status >= 200 && res.status < 300
        ? {}
        : { error: `HTTP ${res.status}` }),
    };
  }).pipe(Effect.catch(mapFetchBytesFailure(url)));
}

/** Dumb fetch, streamed and cut at `maxBytes` — Cap supplies UA / limits / Accept. Abort → `{ ok: false }`. */
export function fetchBytesEffect(
  url: string,
  signal: AbortSignal,
  options: FetchBytesOptions
): Effect.Effect<FetchBytesResult, never, HttpClient.HttpClient> {
  const target = resolveFetchTarget(url);
  if ("error" in target) {
    return Effect.succeed(fetchBytesFailure(target.url, target.error));
  }

  return fetchBytesBody(target.url, options).pipe(
    Effect.raceFirst(abortWhen(signal)),
    Effect.exit,
    Effect.map((exit) => {
      if (Exit.isSuccess(exit)) return exit.value;
      if (Cause.hasInterruptsOnly(exit.cause)) {
        return fetchBytesFailure(
          target.url,
          new Error("This operation was aborted")
        );
      }
      return fetchBytesFailure(target.url, Cause.squash(exit.cause));
    })
  );
}
