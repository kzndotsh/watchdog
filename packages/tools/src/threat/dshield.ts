import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString, isRecord } from "../parse/coerce";

export const dshieldLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("isc.sans.edu"),
  found: z.boolean(),
  attacks: z.number().int().nullable(),
  count: z.number().int().nullable(),
  maxrisk: z.string().nullable(),
  asname: z.string().nullable(),
  network: z.string().nullable(),
  asn: z.number().int().nullable(),
  asCountry: z.string().nullable(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  threatFeedCount: z.number().int().nullable(),
});

export type DshieldLookupSnapshot = z.infer<typeof dshieldLookupSnapshotSchema>;

function toIntOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Math.trunc(Number(value.trim()));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toLooseString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Nested `ip` object: count, attacks, dates, ASN, threatfeeds. */
export function parseDshieldBody(
  ip: string,
  queriedAt: string,
  data: Record<string, unknown>
): DshieldLookupSnapshot {
  const attacks = toIntOrNull(data.attacks);
  const count = toIntOrNull(data.count);
  const maxrisk = toLooseString(data.maxrisk);
  const asname = asString(data.asname);
  const network = asString(data.network);
  const threatfeeds = data.threatfeeds;
  const threatFeedCount = isRecord(threatfeeds)
    ? Object.keys(threatfeeds).length
    : toIntOrNull(data.threatfeedscount);

  return dshieldLookupSnapshotSchema.parse({
    ip,
    queriedAt,
    source: "isc.sans.edu",
    found: attacks !== null || count !== null || asname !== null,
    attacks,
    count,
    maxrisk,
    asname,
    network,
    asn: toIntOrNull(data.as),
    asCountry: asString(data.ascountry),
    firstSeen: asString(data.mindate),
    lastSeen: asString(data.maxdate),
    threatFeedCount,
  });
}

/**
 * SANS ISC / DShield IP report — attack sightings against ISC's honeypot network.
 * GET https://isc.sans.edu/api/ip/{ip}?json
 * @see https://isc.sans.edu/api
 */

interface DshieldOptions {
  userAgent?: string;
}

export function fetchDshieldLookupEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: DshieldOptions
): Effect.Effect<DshieldLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchDshieldLookupGen() {
    const ip = normalizeIp(ipRaw);
    const ua =
      options?.userAgent ??
      `${watchdogUserAgent("threat.dshield.lookup")}; contact: osint@watchdog.invalid)`;

    const { body } = yield* fetchJsonObjectEffect({
      url: `https://isc.sans.edu/api/ip/${encodeURIComponent(ip)}?json`,
      signal,
      service: "DShield",
      subject: ip,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });
    const data = isRecord(body.ip) ? body.ip : {};
    return parseDshieldBody(ip, new Date().toISOString(), data);
  });
}
