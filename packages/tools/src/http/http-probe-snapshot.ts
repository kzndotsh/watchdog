import { createHash } from "node:crypto";

import type { FetchBytesResult } from "./fetch-bytes";
import { detectCdnHints, pickSecurityHeaders } from "./http-probe-headers";
import {
  httpProbeSnapshotSchema,
  type HttpProbeSnapshot,
} from "./http-probe-schema";

export interface ProbeHop {
  ok: boolean;
  status: number;
  headers: Headers;
  finalUrl: string;
  error?: string;
}

export function emptyHttpProbeSnapshot(
  host: string,
  fallbackOrigin: string,
  error: string
): HttpProbeSnapshot {
  return httpProbeSnapshotSchema.parse({
    host,
    queriedAt: new Date().toISOString(),
    finalUrl: fallbackOrigin,
    status: 0,
    ok: false,
    securityHeaders: {},
    server: null,
    via: null,
    cdnHints: [],
    securityTxt: {
      url: new URL("/.well-known/security.txt", fallbackOrigin).href,
      status: 0,
      present: false,
      bodyPreview: null,
    },
    favicon: {
      url: new URL("/favicon.ico", fallbackOrigin).href,
      status: 0,
      sha256: null,
      contentType: null,
    },
    error,
  });
}

function securityTxtPreview(secTxt: FetchBytesResult): string | null {
  if (!secTxt.ok || secTxt.bytes.byteLength === 0) return null;
  return new TextDecoder().decode(secTxt.bytes).slice(0, 2000);
}

function faviconSha256(favicon: FetchBytesResult): string | null {
  if (!favicon.ok || favicon.bytes.byteLength === 0) return null;
  return createHash("sha256").update(favicon.bytes).digest("hex");
}

export function buildHttpProbeSnapshot(input: {
  host: string;
  primary: ProbeHop;
  securityTxtUrl: string;
  faviconUrl: string;
  secTxt: FetchBytesResult;
  favicon: FetchBytesResult;
}): HttpProbeSnapshot {
  const bodyPreview = securityTxtPreview(input.secTxt);
  return httpProbeSnapshotSchema.parse({
    host: input.host,
    queriedAt: new Date().toISOString(),
    finalUrl: input.primary.finalUrl,
    status: input.primary.status,
    ok: input.primary.ok,
    securityHeaders: pickSecurityHeaders(input.primary.headers),
    server: input.primary.headers.get("server"),
    via: input.primary.headers.get("via"),
    cdnHints: detectCdnHints(input.primary.headers),
    securityTxt: {
      url: input.securityTxtUrl,
      status: input.secTxt.status,
      present: input.secTxt.ok && Boolean(bodyPreview?.includes("Contact:")),
      bodyPreview,
    },
    favicon: {
      url: input.faviconUrl,
      status: input.favicon.status,
      sha256: faviconSha256(input.favicon),
      contentType: input.favicon.contentType,
    },
    ...(input.primary.ok ? {} : { error: `HTTP ${input.primary.status}` }),
  });
}
