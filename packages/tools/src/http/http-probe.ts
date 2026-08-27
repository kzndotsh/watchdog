import { createHash } from "node:crypto";

import { z } from "zod";

import { errorMessage } from "../errors/tools-error";
import { fetchBytes } from "../http/fetch-bytes";

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

function fetchHeadOrGet(
  url: string,
  signal: AbortSignal,
  userAgent: string
): Promise<{
  ok: boolean;
  status: number;
  headers: Headers;
  finalUrl: string;
  error?: string;
}> {
  const getFallback = () =>
    fetch(url, {
      method: "GET",
      redirect: "follow",
      signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "*/*",
        Range: "bytes=0-0",
      },
    }).then((get) => ({
      ok: get.ok,
      status: get.status,
      headers: get.headers,
      finalUrl: get.url || url,
    }));

  return fetch(url, {
    method: "HEAD",
    redirect: "follow",
    signal,
    headers: { "User-Agent": userAgent, Accept: "*/*" },
  })
    .then((head) => {
      if (head.status !== 405 && head.status !== 501) {
        return {
          ok: head.ok,
          status: head.status,
          headers: head.headers,
          finalUrl: head.url || url,
        };
      }
      return getFallback();
    })
    .catch(() => getFallback());
}

/**
 * One Cap / one origin: security headers + security.txt + favicon hash + CDN hints.
 * Active HTTP — invasive.
 */
export function fetchHttpProbe(
  host: string,
  signal: AbortSignal,
  options: { userAgent: string; preferHttps?: boolean }
): Promise<HttpProbeSnapshot> {
  return (async () => {
    const preferHttps = options.preferHttps ?? true;
    const origins = preferHttps
      ? [`https://${host}/`, `http://${host}/`]
      : [`http://${host}/`, `https://${host}/`];

    let lastError: string | undefined;
    let primary: Awaited<ReturnType<typeof fetchHeadOrGet>> | null = null;
    let originBase = origins[0];

    for (const origin of origins) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- ordered fallback (https then http); stops at first reachable origin, must stay sequential
        const res = await fetchHeadOrGet(origin, signal, options.userAgent);
        primary = res;
        originBase = `${new URL(res.finalUrl).origin}/`;
        if (res.status > 0) break;
      } catch (error) {
        lastError = errorMessage(error);
      }
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

    const [secTxt, favicon] = await Promise.all([
      fetchBytes(securityTxtUrl, signal, {
        userAgent: options.userAgent,
        maxBytes: 16_384,
        accept: "text/plain,*/*",
      }),
      fetchBytes(faviconUrl, signal, {
        userAgent: options.userAgent,
        maxBytes: 65_536,
        accept: "image/*,*/*",
      }),
    ]);

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
  })();
}
