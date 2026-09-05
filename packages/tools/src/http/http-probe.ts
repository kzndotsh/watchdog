import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { errorMessage } from "../errors/tools-error";
import { fetchBytesEffect } from "./fetch-bytes";
import {
  httpProbeSnapshotSchema,
  type HttpProbeSnapshot,
} from "./http-probe-schema";
import {
  buildHttpProbeSnapshot,
  emptyHttpProbeSnapshot,
  type ProbeHop,
} from "./http-probe-snapshot";

export { httpProbeSnapshotSchema, type HttpProbeSnapshot };

type ProbeAttempt = { readonly hop: ProbeHop } | { readonly error: string };

function hopFromResponse(res: Response, url: string): ProbeHop {
  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    finalUrl: res.url || url,
  };
}

function fetchFollowEffect(
  url: string,
  method: "HEAD" | "GET",
  signal: AbortSignal,
  userAgent: string
): Effect.Effect<Response, ToolsTag, HttpClient.HttpClient> {
  return Effect.tryPromise({
    try: () =>
      fetch(url, {
        method,
        redirect: "follow",
        signal,
        headers:
          method === "GET"
            ? {
                "User-Agent": userAgent,
                Accept: "*/*",
                Range: "bytes=0-0",
              }
            : { "User-Agent": userAgent, Accept: "*/*" },
      }),
    catch: mapToolsCatch,
  });
}

function fetchHeadOrGetEffect(
  url: string,
  signal: AbortSignal,
  userAgent: string
): Effect.Effect<ProbeHop, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchHeadOrGetGen() {
    const headResult = yield* Effect.result(
      fetchFollowEffect(url, "HEAD", signal, userAgent)
    );
    if (Result.isSuccess(headResult)) {
      const head = headResult.success;
      if (head.status !== 405 && head.status !== 501) {
        return hopFromResponse(head, url);
      }
    }
    const get = yield* fetchFollowEffect(url, "GET", signal, userAgent);
    return hopFromResponse(get, url);
  });
}

function probeOriginEffect(
  origin: string,
  signal: AbortSignal,
  userAgent: string
): Effect.Effect<ProbeAttempt, never, HttpClient.HttpClient> {
  return Effect.result(fetchHeadOrGetEffect(origin, signal, userAgent)).pipe(
    Effect.map((result) =>
      Result.isSuccess(result)
        ? { hop: result.success }
        : { error: errorMessage(result.failure) }
    )
  );
}

/**
 * One Cap / one origin: security headers + security.txt + favicon hash + CDN hints.
 * Active HTTP — invasive.
 */
export function fetchHttpProbeEffect(
  host: string,
  signal: AbortSignal,
  options: { userAgent: string; preferHttps?: boolean }
): Effect.Effect<HttpProbeSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchHttpProbeGen() {
    const preferHttps = options.preferHttps ?? true;
    const origins = preferHttps
      ? [`https://${host}/`, `http://${host}/`]
      : [`http://${host}/`, `https://${host}/`];

    let lastError: string | undefined;
    let primary: ProbeHop | null = null;
    let originBase = origins[0];

    for (const origin of origins) {
      const attempt = yield* probeOriginEffect(
        origin,
        signal,
        options.userAgent
      );
      if ("error" in attempt) {
        lastError = attempt.error;
        continue;
      }
      primary = attempt.hop;
      originBase = `${new URL(attempt.hop.finalUrl).origin}/`;
      if (attempt.hop.status > 0) break;
    }

    if (!primary) {
      return emptyHttpProbeSnapshot(
        host,
        origins[0],
        lastError ?? "HTTP probe failed"
      );
    }

    const securityTxtUrl = new URL("/.well-known/security.txt", originBase)
      .href;
    const faviconUrl = new URL("/favicon.ico", originBase).href;

    const [secTxt, favicon] = yield* Effect.all(
      [
        fetchBytesEffect(securityTxtUrl, signal, {
          userAgent: options.userAgent,
          maxBytes: 16_384,
          accept: "text/plain,*/*",
        }),
        fetchBytesEffect(faviconUrl, signal, {
          userAgent: options.userAgent,
          maxBytes: 65_536,
          accept: "image/*,*/*",
        }),
      ],
      { concurrency: 2 }
    );

    return buildHttpProbeSnapshot({
      host,
      primary,
      securityTxtUrl,
      faviconUrl,
      secTxt,
      favicon,
    });
  });
}
