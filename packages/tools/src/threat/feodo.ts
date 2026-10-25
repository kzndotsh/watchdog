import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import { normalizeIpEffect } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import type { Egress } from "../http/egress";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { createServedCache } from "../http/served-cache";
import { nowIsoStringEffect } from "../infra/clock";
import {
  findFeodoEntry,
  parseFeodoEntries,
  type FeodoEntry,
} from "./feodo-parse";

export { parseFeodoEntries } from "./feodo-parse";

export const feodoLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("feodotracker.abuse.ch"),
  found: z.boolean(),
  malware: z.string().nullable(),
  status: z.string().nullable(),
  firstSeen: z.string().nullable(),
  lastOnline: z.string().nullable(),
});

export type FeodoLookupSnapshot = z.infer<typeof feodoLookupSnapshotSchema>;

const FEODO_BLOCKLIST_URL =
  "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json";
const CACHE_TTL_MS = 60 * 60_000;

const BLOCKLIST_CACHE_KEY = "ipblocklist_recommended";
const blocklistCache = createServedCache<FeodoEntry[]>(CACHE_TTL_MS);

type FeodoOptions = {
  userAgent?: string;
  apiKey?: string;
};

function blocklistHeaders(
  userAgent: string,
  apiKey: string | undefined
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent,
  };
  if (apiKey) headers["Auth-Key"] = apiKey;
  return headers;
}

function fetchBlocklistEffect(
  signal: AbortSignal,
  userAgent: string,
  apiKey: string | undefined
): Effect.Effect<FeodoEntry[], ToolsTag, HttpClient.HttpClient | Egress> {
  return Effect.gen(function* fetchFeodoBlocklistGen() {
    const hit = yield* blocklistCache.get(BLOCKLIST_CACHE_KEY);
    if (hit) return hit;

    const { body } = yield* fetchJsonUnknownEffect({
      url: FEODO_BLOCKLIST_URL,
      signal,
      service: "Feodo Tracker",
      subject: "blocklist",
      init: { method: "GET", headers: blocklistHeaders(userAgent, apiKey) },
    });
    const entries = parseFeodoEntries(body);
    yield* blocklistCache.set(
      BLOCKLIST_CACHE_KEY,
      entries,
      FEODO_BLOCKLIST_URL
    );
    return entries;
  });
}

function toFeodoSnapshot(
  ip: string,
  match: FeodoEntry | undefined,
  queriedAt: string
): FeodoLookupSnapshot {
  return feodoLookupSnapshotSchema.parse({
    ip,
    queriedAt,
    source: "feodotracker.abuse.ch",
    found: Boolean(match),
    malware: match?.malware ?? null,
    status: match?.status ?? null,
    firstSeen: match?.firstSeen ?? null,
    lastOnline: match?.lastOnline ?? null,
  });
}

/**
 * Feodo Tracker (abuse.ch) botnet C2 IP blocklist — membership check.
 * GET …/ipblocklist_recommended.json, module-level 1h TTL cache (shared
 * across lookups this process). Optional Auth-Key header.
 * @see https://feodotracker.abuse.ch/
 */
export function fetchFeodoLookupEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: FeodoOptions
): Effect.Effect<
  FeodoLookupSnapshot,
  ToolsTag,
  HttpClient.HttpClient | Egress
> {
  return Effect.gen(function* fetchFeodoLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const ip = yield* normalizeIpEffect(ipRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("threat.feodo.lookup");
    const entries = yield* fetchBlocklistEffect(signal, ua, options?.apiKey);
    return toFeodoSnapshot(ip, findFeodoEntry(entries, ip), queriedAt);
  });
}
