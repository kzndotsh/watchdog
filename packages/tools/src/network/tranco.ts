import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { HttpVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const trancoLookupSnapshotSchema = z.object({
  domain: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("tranco-list.eu"),
  found: z.boolean(),
  latestRank: z.number().int().nullable(),
  latestDate: z.string().nullable(),
  ranksCount: z.number().int(),
});

export type TrancoLookupSnapshot = z.infer<typeof trancoLookupSnapshotSchema>;

interface TrancoRankRow {
  date: string;
  rank: number;
}

function parseRanks(value: unknown): TrancoRankRow[] {
  if (!Array.isArray(value)) return [];
  const rows: TrancoRankRow[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const date = typeof row.date === "string" ? row.date : null;
    let rank: number | null = null;
    if (typeof row.rank === "number") {
      rank = row.rank;
    } else if (typeof row.rank === "string") {
      rank = Math.trunc(Number(row.rank));
    }
    if (date === null || rank === null || !Number.isFinite(rank)) continue;
    rows.push({ date, rank });
  }
  return rows;
}

/**
 * Tranco top-sites ranking history for a domain (past ~30 days of daily lists).
 * GET https://tranco-list.eu/api/ranks/domain/{domain} — rate limit 1 req/s.
 * @see https://tranco-list.eu/api_documentation
 */

interface TrancoOptions {
  userAgent?: string;
}

function readTrancoBodyEffect(
  domain: string,
  signal: AbortSignal,
  ua: string
): Effect.Effect<Record<string, unknown>, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* readTrancoBodyGen() {
    const { status, body } = yield* fetchJsonObjectEffect({
      url: `https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`,
      signal,
      service: "Tranco",
      subject: domain,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 403,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });
    if (status === 403) {
      return yield* new HttpVendorError({ service: "Tranco", status });
    }
    return body;
  });
}

export function fetchTrancoLookupEffect(
  domainRaw: string,
  signal: AbortSignal,
  options?: TrancoOptions
): Effect.Effect<TrancoLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchTrancoLookupGen() {
    const domain = normalizeHost(domainRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("network.tranco.lookup");

    const body = yield* readTrancoBodyEffect(domain, signal, ua);
    const rows = parseRanks(body.ranks).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const latest = rows[0] ?? null;

    return trancoLookupSnapshotSchema.parse({
      domain,
      queriedAt: new Date().toISOString(),
      source: "tranco-list.eu",
      found: rows.length > 0,
      latestRank: latest?.rank ?? null,
      latestDate: latest?.date ?? null,
      ranksCount: rows.length,
    });
  });
}
