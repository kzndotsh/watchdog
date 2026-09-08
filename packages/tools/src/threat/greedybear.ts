import { isIP } from "node:net";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { createTtlCache } from "../cache/ttl-memory";
import { ParseVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { expandIpv6 } from "../network/ip-lookup-cymru";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { asString, isRecord } from "../parse/coerce";

export const greedybearLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain"]),
  queriedAt: z.string().min(1),
  source: z.literal("greedybear.honeynet.org"),
  found: z.boolean(),
  feed: z.literal("all/scanner/recent"),
});

export type GreedybearLookupSnapshot = z.infer<
  typeof greedybearLookupSnapshotSchema
>;

const FEED_URL =
  "https://greedybear.honeynet.org/api/feeds/all/scanner/recent.json";
const FEED_TTL_MS = 30 * 60_000;
const FEED_CACHE_KEY = "all-scanner-recent";
const feedCache = createTtlCache<Set<string>>(FEED_TTL_MS);

/** Normalize feed IOC keys so equivalent IPv6 spellings match. */
export function greedybearIocKey(raw: string): string {
  const trimmed = raw.trim();
  if (isIP(trimmed) === 6) {
    return expandIpv6(trimmed.toLowerCase());
  }
  if (isIP(trimmed) === 4) {
    return trimmed;
  }
  return trimmed.toLowerCase();
}

/** IOC values from the public scanner feed JSON. */
export function parseGreedybearIocValues(body: unknown): Set<string> | null {
  if (!isRecord(body)) return null;
  const rows = Array.isArray(body.iocs) ? body.iocs : [];
  const values = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const value = asString(row.value);
    if (value) values.add(greedybearIocKey(value));
  }
  return values;
}

function fetchScannerFeedEffect(
  signal: AbortSignal,
  ua: string
): Effect.Effect<Set<string>, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchGreedybearScannerFeedGen() {
    const cached = feedCache.get(FEED_CACHE_KEY);
    if (cached) return cached;

    const { body } = yield* fetchJsonObjectEffect({
      url: FEED_URL,
      signal,
      service: "GreedyBear",
      subject: "feed",
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });
    const parsed = parseGreedybearIocValues(body);
    if (parsed === null) {
      return yield* new ParseVendorError({
        service: "GreedyBear",
        subject: "feed",
      });
    }
    feedCache.set(FEED_CACHE_KEY, parsed);
    return parsed;
  });
}

/**
 * GreedyBear (Honeynet Project) public scanner feed — membership check for
 * an IP/domain against the last 3 days of honeypot-observed scanners.
 * GET https://greedybear.honeynet.org/api/feeds/all/scanner/recent.json
 * (30-minute in-process cache — public feed, not per-query.)
 * @see https://greedybear-docs.readthedocs.io/en/latest/OpenAPI.html
 */

interface GreedybearOptions {
  userAgent?: string;
}

export function fetchGreedybearLookupEffect(
  queryRaw: string,
  signal: AbortSignal,
  options?: GreedybearOptions
): Effect.Effect<GreedybearLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchGreedybearLookupGen() {
    const { kind, value } = classifyIpOrHost(queryRaw);
    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.greedybear.lookup");

    const feed = yield* fetchScannerFeedEffect(signal, ua);

    return greedybearLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "greedybear.honeynet.org",
      found: feed.has(greedybearIocKey(value)),
      feed: "all/scanner/recent",
    });
  });
}
