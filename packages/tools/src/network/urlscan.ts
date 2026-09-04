import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString, isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const urlscanHitSchema = z.object({
  uuid: z.string(),
  url: z.string(),
  domain: z.string().nullable(),
  ip: z.string().nullable(),
  country: z.string().nullable(),
  server: z.string().nullable(),
  asn: z.string().nullable(),
  asnName: z.string().nullable(),
  ptr: z.string().nullable(),
  scannedAt: z.string().nullable(),
  resultUrl: z.string().nullable(),
});

export const urlscanLookupSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("urlscan.io/api/v1/search"),
  total: z.number().int().nullable(),
  urls: z.array(z.string()),
  domains: z.array(z.string()),
  hits: z.array(urlscanHitSchema),
});

export type UrlscanHit = z.infer<typeof urlscanHitSchema>;
export type UrlscanLookupSnapshot = z.infer<typeof urlscanLookupSnapshotSchema>;

/**
 * URLScan.io search API — past public scans for a domain (not a live submit).
 * GET https://urlscan.io/api/v1/search/?q=page.domain:{host}&size=
 * @see https://urlscan.io/docs/api/
 */

interface UrlscanOptions {
  userAgent?: string;
  size?: number;
}

function parseUrlscanHit(row: Record<string, unknown>): UrlscanHit | null {
  const task = isRecord(row.task) ? row.task : {};
  const page = isRecord(row.page) ? row.page : {};

  const pageUrl = asString(page.url) ?? asString(task.url);
  const uuid = asString(task.uuid) ?? asString(row._id) ?? "";
  if (!pageUrl || !uuid) return null;

  let domain: string | null = asString(page.domain) ?? asString(task.domain);
  if (domain) {
    try {
      domain = normalizeHost(domain);
    } catch {
      domain = null;
    }
  }

  return {
    uuid,
    url: pageUrl,
    domain,
    ip: asString(page.ip),
    country: asString(page.country),
    server: asString(page.server),
    asn: asString(page.asn),
    asnName: asString(page.asnname),
    ptr: asString(page.ptr),
    scannedAt: asString(task.time),
    resultUrl: asString(row.result),
  };
}

function collectUrlscanHits(rows: unknown[]): {
  hits: UrlscanHit[];
  urls: string[];
  domains: string[];
} {
  const hits: UrlscanHit[] = [];
  const urls: string[] = [];
  const domains: string[] = [];
  const seenUrl = new Set<string>();
  const seenDomain = new Set<string>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const hit = parseUrlscanHit(row);
    if (!hit) continue;
    hits.push(hit);

    if (!seenUrl.has(hit.url)) {
      seenUrl.add(hit.url);
      urls.push(hit.url);
    }
    if (hit.domain && !seenDomain.has(hit.domain)) {
      seenDomain.add(hit.domain);
      domains.push(hit.domain);
    }
  }

  return { hits, urls, domains };
}

export function fetchUrlscanSearchEffect(
  hostRaw: string,
  signal: AbortSignal,
  options?: UrlscanOptions
): Effect.Effect<UrlscanLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchUrlscanSearchGen() {
    const host = normalizeHost(hostRaw);
    const size = Math.min(Math.max(options?.size ?? 20, 1), 100);
    const ua =
      options?.userAgent ?? watchdogUserAgent("network.urlscan.lookup");

    const url = new URL("https://urlscan.io/api/v1/search/");
    url.searchParams.set("q", `page.domain:${host}`);
    url.searchParams.set("size", String(size));

    const { body } = yield* fetchJsonObjectEffect({
      url,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
      signal,
      service: "URLScan",
      subject: host,
    });
    const rows = Array.isArray(body.results) ? body.results : [];
    const { hits, urls, domains } = collectUrlscanHits(rows);

    return urlscanLookupSnapshotSchema.parse({
      host,
      queriedAt: new Date().toISOString(),
      source: "urlscan.io/api/v1/search",
      total: typeof body.total === "number" ? body.total : null,
      urls,
      domains,
      hits,
    });
  });
}
