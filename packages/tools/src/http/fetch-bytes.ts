import { Cause, Effect, Exit } from "effect";
import { HttpClient } from "effect/unstable/http";

import { errorMessage } from "../errors/tools-error";
import { abortWhen } from "./abort-when";

export interface FetchBytesOptions {
  /** User-Agent header (Cap OPSEC policy — pass from Cap, never hardcode Cap id here). */
  userAgent: string;
  /** Truncate response body to this many bytes. */
  maxBytes: number;
  /** Accept header. */
  accept?: string;
  headers?: Record<string, string>;
}

export interface FetchBytesResult {
  ok: boolean;
  status: number;
  bytes: Uint8Array;
  contentType: string | null;
  markdownTokensHint?: number;
  finalUrl: string;
  error?: string;
}

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
  return (error: unknown) => Effect.succeed(fetchBytesFailure(url, error));
}

function fetchBytesBody(
  url: string,
  options: FetchBytesOptions
): Effect.Effect<FetchBytesResult, never, HttpClient.HttpClient> {
  const accept = options.accept ?? "*/*";
  return Effect.gen(function* fetchBytesGen() {
    const client = yield* HttpClient.HttpClient;
    const res = yield* client.get(url, {
      headers: {
        Accept: accept,
        "User-Agent": options.userAgent,
        ...options.headers,
      },
    });
    const buffer = yield* res.arrayBuffer;
    const buf = new Uint8Array(buffer);
    const truncated =
      buf.byteLength > options.maxBytes ? buf.slice(0, options.maxBytes) : buf;
    const tokenHeader = res.headers["x-markdown-tokens"];
    const markdownTokensHint =
      tokenHeader !== undefined && tokenHeader !== ""
        ? Math.trunc(Number(tokenHeader))
        : undefined;
    const requestUrl = res.request.url;
    const finalUrl = requestUrl === "" ? url : requestUrl;
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      bytes: truncated,
      contentType: res.headers["content-type"] ?? null,
      ...(Number.isFinite(markdownTokensHint) ? { markdownTokensHint } : {}),
      finalUrl: finalUrl || url,
      ...(res.status >= 200 && res.status < 300
        ? {}
        : { error: `HTTP ${res.status}` }),
    };
  }).pipe(Effect.catch(mapFetchBytesFailure(url)));
}

/** Dumb fetch + truncate — Cap supplies UA / limits / Accept. Abort → `{ ok: false }`. */
export function fetchBytesEffect(
  url: string,
  signal: AbortSignal,
  options: FetchBytesOptions
): Effect.Effect<FetchBytesResult, never, HttpClient.HttpClient> {
  return fetchBytesBody(url, options).pipe(
    Effect.raceFirst(abortWhen(signal)),
    Effect.exit,
    Effect.map((exit) => {
      if (Exit.isSuccess(exit)) return exit.value;
      if (Cause.hasInterruptsOnly(exit.cause)) {
        return fetchBytesFailure(url, new Error("This operation was aborted"));
      }
      return fetchBytesFailure(url, Cause.squash(exit.cause));
    })
  );
}
