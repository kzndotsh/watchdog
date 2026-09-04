import { createHash } from "node:crypto";

import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { errorMessage } from "../errors/tools-error";
import { fetchBytesEffect } from "./fetch-bytes";

const SECURITY_HEADER_NAMES = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "cross-origin-embedder-policy",
] as const;

export const httpProbeSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  finalUrl: z.string(),
  status: z.number(),
  ok: z.boolean(),
  securityHeaders: z.record(z.string(), z.string()),
  server: z.string().nullable(),
  via: z.string().nullable(),
  cdnHints: z.array(z.string()),
  securityTxt: z.object({
    url: z.string(),
    status: z.number(),
    present: z.boolean(),
    bodyPreview: z.string().nullable(),
  }),
  favicon: z.object({
    url: z.string(),
    status: z.number(),
    sha256: z.string().nullable(),
    contentType: z.string().nullable(),
  }),
  error: z.string().optional(),
});

export type HttpProbeSnapshot = z.infer<typeof httpProbeSnapshotSchema>;

function pickHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SECURITY_HEADER_NAMES) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

function detectCdnHints(headers: Headers): string[] {
  const hints: string[] = [];
  const server = headers.get("server")?.toLowerCase() ?? "";
  const via = headers.get("via")?.toLowerCase() ?? "";
  const cfRay = headers.get("cf-ray");
  const cf = headers.get("cf-cache-status");
  const xcdn = headers.get("x-cdn") ?? headers.get("x-cache");
  const akamai =
    headers.get("x-akamai-transformed") ?? headers.get("akamai-grn");
  const fastly =
    headers.get("x-served-by") ?? headers.get("fastly-debug-digest");
  if (cfRay || cf) hints.push("cloudflare");
  if (akamai) hints.push("akamai");
  if (fastly || via.includes("fastly")) hints.push("fastly");
  if (server.includes("cloudflare")) hints.push("cloudflare");
  if (server.includes("amazons3") || headers.get("x-amz-request-id")) {
    hints.push("aws");
  }
  if (xcdn) hints.push(`header:${xcdn.slice(0, 64)}`);
  return [...new Set(hints)];
}

interface ProbeHop {
  ok: boolean;
  status: number;
  headers: Headers;
  finalUrl: string;
  error?: string;
}

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
      return httpProbeSnapshotSchema.parse({
        host,
        queriedAt: new Date().toISOString(),
        finalUrl: origins[0],
        status: 0,
        ok: false,
        securityHeaders: {},
        server: null,
        via: null,
        cdnHints: [],
        securityTxt: {
          url: new URL("/.well-known/security.txt", origins[0]).href,
          status: 0,
          present: false,
          bodyPreview: null,
        },
        favicon: {
          url: new URL("/favicon.ico", origins[0]).href,
          status: 0,
          sha256: null,
          contentType: null,
        },
        error: lastError ?? "HTTP probe failed",
      });
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

    const bodyPreview =
      secTxt.ok && secTxt.bytes.byteLength > 0
        ? new TextDecoder().decode(secTxt.bytes).slice(0, 2000)
        : null;

    return httpProbeSnapshotSchema.parse({
      host,
      queriedAt: new Date().toISOString(),
      finalUrl: primary.finalUrl,
      status: primary.status,
      ok: primary.ok,
      securityHeaders: pickHeaders(primary.headers),
      server: primary.headers.get("server"),
      via: primary.headers.get("via"),
      cdnHints: detectCdnHints(primary.headers),
      securityTxt: {
        url: securityTxtUrl,
        status: secTxt.status,
        present: secTxt.ok && Boolean(bodyPreview?.includes("Contact:")),
        bodyPreview,
      },
      favicon: {
        url: faviconUrl,
        status: favicon.status,
        sha256:
          favicon.ok && favicon.bytes.byteLength > 0
            ? createHash("sha256").update(favicon.bytes).digest("hex")
            : null,
        contentType: favicon.contentType,
      },
      ...(primary.ok ? {} : { error: `HTTP ${primary.status}` }),
    });
  });
}
