import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { asString, isRecord } from "../parse/coerce";

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

interface FeodoEntry {
  ipAddress: string;
  malware: string | null;
  status: string | null;
  firstSeen: string | null;
  lastOnline: string | null;
}

const FEODO_BLOCKLIST_URL =
  "https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json";
const CACHE_TTL_MS = 60 * 60_000;

let cachedEntries: FeodoEntry[] | null = null;
let cachedAt = 0;

export function parseFeodoEntries(raw: unknown): FeodoEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: FeodoEntry[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const ipAddress = asString(row.ip_address) ?? asString(row.ip);
    if (!ipAddress) continue;
    out.push({
      ipAddress,
      malware: asString(row.malware),
      status: asString(row.status),
      firstSeen: asString(row.first_seen),
      lastOnline: asString(row.last_online),
    });
  }
  return out;
}

interface FeodoOptions2 {
  userAgent: string;
  apiKey?: string;
}

function fetchBlocklistEffect(
  signal: AbortSignal,
  options: FeodoOptions2
): Effect.Effect<FeodoEntry[], ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchFeodoBlocklistGen() {
    const now = Date.now();
    if (cachedEntries && now - cachedAt < CACHE_TTL_MS) return cachedEntries;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": options.userAgent,
    };
    if (options.apiKey) headers["Auth-Key"] = options.apiKey;

    const { body } = yield* fetchJsonUnknownEffect({
      url: FEODO_BLOCKLIST_URL,
      signal,
      service: "Feodo Tracker",
      subject: "blocklist",
      init: { method: "GET", headers },
    });
    const entries = parseFeodoEntries(body);
    cachedEntries = entries;
    cachedAt = Date.now();
    return entries;
  });
}

/**
 * Feodo Tracker (abuse.ch) botnet C2 IP blocklist — membership check.
 * GET …/ipblocklist_recommended.json, module-level 1h TTL cache (shared
 * across lookups this process). Optional Auth-Key header.
 * @see https://feodotracker.abuse.ch/
 */

interface FeodoOptions {
  userAgent?: string;
  apiKey?: string;
}

export function fetchFeodoLookupEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: FeodoOptions
): Effect.Effect<FeodoLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchFeodoLookupGen() {
    const ip = normalizeIp(ipRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("threat.feodo.lookup");

    const entries = yield* fetchBlocklistEffect(signal, {
      userAgent: ua,
      apiKey: options?.apiKey,
    });
    const match = entries.find((e) => e.ipAddress === ip);

    return feodoLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      source: "feodotracker.abuse.ch",
      found: Boolean(match),
      malware: match?.malware ?? null,
      status: match?.status ?? null,
      firstSeen: match?.firstSeen ?? null,
      lastOnline: match?.lastOnline ?? null,
    });
  });
}
