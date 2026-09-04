import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import {
  asBool,
  asNumber,
  asString,
  isRecord,
  recordRows,
} from "../parse/coerce";

export const ipctlLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("api.ipctl.io"),
  asn: z.number().int().nullable(),
  asName: z.string().nullable(),
  bgpPrefix: z.string().nullable(),
  /** Prefix/RIR country — not MaxMind GeoIP. */
  rirCountryCode: z.string().nullable(),
  rir: z.string().nullable(),
  rpkiStatus: z.string().nullable(),
  reverseDns: z.string().nullable(),
  isAnycast: z.boolean().nullable(),
  isBogon: z.boolean().nullable(),
  /** MaxMind-style estimate — label as GeoIP, not RIR. */
  geoCountryCode: z.string().nullable(),
  geoCity: z.string().nullable(),
  geoRegion: z.string().nullable(),
  geoCountryName: z.string().nullable(),
  threatScore: z.number().nullable(),
  tags: z.array(z.string()),
});

export type IpctlLookupSnapshot = z.infer<typeof ipctlLookupSnapshotSchema>;

function parseIpctlTags(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.tags)) {
    return data.tags.flatMap((row) => {
      const value = asString(row);
      return value === null ? [] : [value];
    });
  }
  return recordRows(data.tags).flatMap((row) => {
    const value = asString(row.name) ?? asString(row.tag);
    return value === null ? [] : [value];
  });
}

function firstString(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function firstNumber(...values: (number | null | undefined)[]): number | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export function parseIpctlBody(
  ip: string,
  queriedAt: string,
  data: Record<string, unknown>
): IpctlLookupSnapshot {
  const prefix = isRecord(data.prefix) ? data.prefix : {};
  const asnObj = isRecord(data.asn) ? data.asn : {};
  const geo = isRecord(data.geo) ? data.geo : {};
  const tags = parseIpctlTags(data);
  const bgpPrefixFromData =
    asString(data.bgp_prefix) ??
    (typeof data.prefix === "string" ? asString(data.prefix) : null);

  return ipctlLookupSnapshotSchema.parse({
    ip,
    queriedAt,
    source: "api.ipctl.io",
    asn: firstNumber(
      asNumber(asnObj.asn),
      asNumber(prefix.asn),
      asNumber(data.asn)
    ),
    asName: asString(asnObj.name),
    bgpPrefix: firstString(asString(prefix.prefix), bgpPrefixFromData),
    rirCountryCode: firstString(
      asString(prefix.country_code),
      asString(asnObj.country_code)
    ),
    rir: firstString(asString(prefix.rir), asString(asnObj.rir)),
    rpkiStatus: firstString(
      asString(prefix.rpki_status),
      asString(data.rpki_status)
    ),
    reverseDns: asString(data.reverse_dns),
    isAnycast: asBool(data.is_anycast),
    isBogon: asBool(data.is_bogon),
    geoCountryCode: asString(geo.country_code),
    geoCity: asString(geo.city),
    geoRegion: firstString(asString(geo.region_name), asString(geo.region)),
    geoCountryName: asString(geo.country_name),
    threatScore: asNumber(data.threat_score),
    tags,
  });
}

/**
 * ipctl.io IP→BGP lookup (BGPView shut down Nov 2025).
 * GET https://api.ipctl.io/v1/ip/{ip}
 * @see https://ipctl.io/vs/bgpview
 */

interface IpctlOptions {
  userAgent?: string;
}

export function fetchIpctlLookupEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: IpctlOptions
): Effect.Effect<IpctlLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchIpctlLookupGen() {
    const ip = normalizeIp(ipRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("network.ipctl.lookup");

    const url = `https://api.ipctl.io/v1/ip/${encodeURIComponent(ip)}`;
    const { body } = yield* fetchJsonObjectEffect({
      url,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
      signal,
      service: "ipctl",
      subject: ip,
    });
    const data = isRecord(body.data) ? body.data : {};
    return parseIpctlBody(ip, new Date().toISOString(), data);
  });
}
