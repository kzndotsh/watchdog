import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString, isRecord } from "../parse/coerce";

export const bgprankingLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("bgpranking-ng.circl.lu"),
  found: z.boolean(),
  asn: z.number().int().nullable(),
  asnDescription: z.string().nullable(),
  asnRank: z.number().nullable(),
  asnPosition: z.number().int().nullable(),
});

export type BgprankingLookupSnapshot = z.infer<
  typeof bgprankingLookupSnapshotSchema
>;

function toAsnNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Math.trunc(Number(value.trim()));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Most recent {asn} for `ip` from CIRCL's IP→ASN history, or null if unmapped. */
function fetchLatestAsnEffect(
  ip: string,
  signal: AbortSignal,
  ua: string
): Effect.Effect<number | null, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchLatestAsnGen() {
    const url = new URL("https://bgpranking-ng.circl.lu/ipasn_history/");
    url.searchParams.set("ip", ip);

    const { body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "BGP Ranking",
      subject: ip,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });
    const entries = isRecord(body.response) ? body.response : {};
    const latestTimestamp = Object.keys(entries)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);
    if (!latestTimestamp) return null;
    const entry = entries[latestTimestamp];
    return toAsnNumber(isRecord(entry) ? entry.asn : undefined);
  });
}

interface AsnRankingResult {
  asnDescription: string | null;
  asnRank: number | null;
  asnPosition: number | null;
}

function fetchAsnRankingEffect(
  asn: number,
  signal: AbortSignal,
  ua: string
): Effect.Effect<AsnRankingResult, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchAsnRankingGen() {
    const { body } = yield* fetchJsonObjectEffect({
      url: "https://bgpranking-ng.circl.lu/json/asn",
      signal,
      service: "BGP Ranking",
      subject: `AS${asn}`,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": ua,
        },
        body: JSON.stringify({ asn: String(asn) }),
      },
    });
    const resp = isRecord(body.response) ? body.response : {};
    const ranking = isRecord(resp.ranking) ? resp.ranking : {};
    return {
      asnDescription: asString(resp.asn_description),
      asnRank: typeof ranking.rank === "number" ? ranking.rank : null,
      asnPosition:
        typeof ranking.position === "number" ? ranking.position : null,
    };
  });
}

/**
 * CIRCL BGP Ranking — IP → ASN (via IP-ASN-History) → malicious-activity rank.
 * GET https://bgpranking-ng.circl.lu/ipasn_history/?ip={ip}
 * POST https://bgpranking-ng.circl.lu/json/asn {"asn": N}
 * @see https://github.com/D4-project/bgp-ranking
 */

interface BgprankingOptions {
  userAgent?: string;
}

export function fetchBgprankingLookupEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: BgprankingOptions
): Effect.Effect<BgprankingLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchBgprankingLookupGen() {
    const ip = normalizeIp(ipRaw);
    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.bgpranking.lookup");

    const asn = yield* fetchLatestAsnEffect(ip, signal, ua);
    if (asn === null) {
      return bgprankingLookupSnapshotSchema.parse({
        ip,
        queriedAt: new Date().toISOString(),
        source: "bgpranking-ng.circl.lu",
        found: false,
        asn: null,
        asnDescription: null,
        asnRank: null,
        asnPosition: null,
      });
    }

    const { asnDescription, asnRank, asnPosition } =
      yield* fetchAsnRankingEffect(asn, signal, ua);

    return bgprankingLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      source: "bgpranking-ng.circl.lu",
      found: true,
      asn,
      asnDescription,
      asnRank,
      asnPosition,
    });
  });
}
