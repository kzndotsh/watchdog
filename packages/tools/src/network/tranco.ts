import { z } from "zod";

import { HttpVendorError } from "../errors/tagged-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { normalizeHost } from "../normalize";
import { isRecord } from "../parse/coerce";

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

type TrancoRankRow = {
  date: string;
  rank: number;
};

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

type TrancoOptions = {
  userAgent: string;
};

export const fetchTrancoLookupEffect = defineJsonProvider({
  service: "Tranco",
  schema: trancoLookupSnapshotSchema,
  normalize: normalizeHost,
  request: (domain, _options: TrancoOptions) => ({
    url: `https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`,
  }),
  // Tranco answers 403 to a request it refuses; that is a failure, not "not ranked".
  notFoundStatuses: [403],
  notFound: ({ status }) => {
    throw new HttpVendorError({ service: "Tranco", status });
  },
  toSnapshot: ({ subject: domain, queriedAt, body }) => {
    const rows = parseRanks(body.ranks).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const latest = rows[0] ?? null;
    return {
      domain,
      queriedAt,
      source: "tranco-list.eu" as const,
      found: rows.length > 0,
      latestRank: latest?.rank ?? null,
      latestDate: latest?.date ?? null,
      ranksCount: rows.length,
    };
  },
});
