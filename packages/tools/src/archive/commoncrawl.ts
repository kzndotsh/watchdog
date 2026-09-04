import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import { HttpVendorError, type ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchBytesEffect } from "../http/fetch-bytes";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const commoncrawlHitSchema = z.object({
  url: z.string(),
  timestamp: z.string().nullable(),
  status: z.string().nullable(),
  mime: z.string().nullable(),
  indexId: z.string(),
});

export const commoncrawlLookupSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("index.commoncrawl.org"),
  indexes: z.array(z.string()),
  urls: z.array(z.string()),
  hits: z.array(commoncrawlHitSchema),
});

export type CommoncrawlHit = z.infer<typeof commoncrawlHitSchema>;
export type CommoncrawlLookupSnapshot = z.infer<
  typeof commoncrawlLookupSnapshotSchema
>;

/** CDX JSON may be NDJSON objects, a JSON array of objects, or array-rows. */
export function parseCommoncrawlCdxText(
  text: string
): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  if (trimmed.startsWith("[")) {
    return parseCommoncrawlCdxArray(trimmed);
  }
  return parseCommoncrawlCdxLines(trimmed);
}

function parseCommoncrawlCdxArrayRow(row: unknown): Record<string, unknown>[] {
  if (isRecord(row)) return [row];
  if (Array.isArray(row) && typeof row[2] === "string") {
    return [
      {
        url: row[2],
        timestamp: typeof row[1] === "string" ? row[1] : null,
        mime: typeof row[3] === "string" ? row[3] : null,
        status: typeof row[4] === "string" ? row[4] : null,
      },
    ];
  }
  return [];
}

function parseCommoncrawlCdxArray(text: string): Record<string, unknown>[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(parseCommoncrawlCdxArrayRow);
  } catch {
    return [];
  }
}

function parseCommoncrawlCdxLines(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const lineTrim = line.trim();
    if (!lineTrim) continue;
    try {
      const row: unknown = JSON.parse(lineTrim);
      if (isRecord(row)) out.push(row);
    } catch {
      /* ignore */
    }
  }
  return out;
}

interface CollinfoIndex {
  id: string;
  cdxApi: string;
}

function parseCollinfoIndexes(
  coll: unknown,
  indexCount: number
): CollinfoIndex[] {
  if (!Array.isArray(coll) || coll.length === 0) {
    throw validationToolsError("Common Crawl collinfo empty");
  }

  const indexes: CollinfoIndex[] = [];
  for (const row of coll) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === "string" ? row.id : "";
    const cdxApi = typeof row["cdx-api"] === "string" ? row["cdx-api"] : "";
    if (!id || !cdxApi) continue;
    indexes.push({ id, cdxApi });
    if (indexes.length >= indexCount) break;
  }

  if (indexes.length === 0) {
    throw validationToolsError("Common Crawl: no usable indexes");
  }
  return indexes;
}

function cdxRowToHit(
  row: Record<string, unknown>,
  indexId: string
): CommoncrawlHit | null {
  const pageUrl = typeof row.url === "string" ? row.url : "";
  if (!pageUrl) return null;
  return {
    url: pageUrl,
    timestamp: typeof row.timestamp === "string" ? row.timestamp : null,
    status: typeof row.status === "string" ? row.status : null,
    mime: typeof row.mime === "string" ? row.mime : null,
    indexId,
  };
}

function collectCdxHits(
  cdxRows: Record<string, unknown>[],
  indexId: string,
  limit: number,
  hits: CommoncrawlHit[],
  urls: string[],
  seenUrl: Set<string>
): void {
  for (const row of cdxRows) {
    const hit = cdxRowToHit(row, indexId);
    if (!hit) continue;
    hits.push(hit);
    if (!seenUrl.has(hit.url)) {
      seenUrl.add(hit.url);
      urls.push(hit.url);
    }
    if (hits.length >= limit) break;
  }
}

function fetchCdxHitsForIndexEffect(
  index: CollinfoIndex,
  host: string,
  limit: number,
  signal: AbortSignal,
  ua: string
): Effect.Effect<string, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchCdxHitsForIndexGen() {
    const url = new URL(index.cdxApi);
    url.searchParams.set("url", `*.${host}/*`);
    url.searchParams.set("output", "json");
    url.searchParams.set("limit", String(Math.min(limit, 50)));

    const result = yield* fetchBytesEffect(url.toString(), signal, {
      userAgent: ua,
      maxBytes: 1_000_000,
      accept: "application/json",
    });
    if (result.status === 404) return "";
    if (!result.ok) {
      return yield* new HttpVendorError({
        service: "Common Crawl CDX",
        status: result.status,
      });
    }
    return new TextDecoder().decode(result.bytes);
  });
}

interface CommoncrawlLookupOptions {
  userAgent?: string;
  /** How many newest indexes to query (default 2). */
  indexes?: number;
  /** Max hits to keep across indexes (default 40). */
  limit?: number;
}

/**
 * Common Crawl CDX — recent crawl indexes for URLs under a host.
 * Resolves latest indexes via collinfo.json, then queries each CDX API.
 * @see https://index.commoncrawl.org/
 */
export function fetchCommoncrawlLookupEffect(
  hostRaw: string,
  signal: AbortSignal,
  options?: CommoncrawlLookupOptions
): Effect.Effect<CommoncrawlLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchCommoncrawlLookupGen() {
    const resolved = options ?? {};
    const host = normalizeHost(hostRaw);
    const indexCount = Math.min(Math.max(resolved.indexes ?? 2, 1), 6);
    const limit = Math.min(Math.max(resolved.limit ?? 40, 1), 200);
    const ua =
      resolved.userAgent ?? watchdogUserAgent("archive.commoncrawl.lookup");

    const { body: coll } = yield* fetchJsonUnknownEffect({
      url: "https://index.commoncrawl.org/collinfo.json",
      signal,
      service: "Common Crawl collinfo",
      subject: host,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });
    const indexes = yield* Effect.try({
      try: () => parseCollinfoIndexes(coll, indexCount),
      catch: mapToolsCatch,
    });

    const hits: CommoncrawlHit[] = [];
    const urls: string[] = [];
    const seenUrl = new Set<string>();

    for (const index of indexes) {
      if (hits.length >= limit) break;

      const text = yield* fetchCdxHitsForIndexEffect(
        index,
        host,
        limit - hits.length,
        signal,
        ua
      );
      if (text === "") continue;

      const cdxRows = parseCommoncrawlCdxText(text);
      collectCdxHits(cdxRows, index.id, limit, hits, urls, seenUrl);
    }

    return commoncrawlLookupSnapshotSchema.parse({
      host,
      queriedAt: new Date().toISOString(),
      source: "index.commoncrawl.org",
      indexes: indexes.map((i) => i.id),
      urls,
      hits,
    });
  });
}
