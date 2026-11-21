import { z } from "zod";

import { child, defineJsonProvider } from "../http/define-json-provider";
import { normalizeIp } from "../normalize";
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

  const hasThreatFeeds = threatFeedCount !== null && threatFeedCount > 0;

  return dshieldLookupSnapshotSchema.parse({
    ip,
    queriedAt,
    source: "isc.sans.edu",
    found: (attacks ?? 0) > 0 || (count ?? 0) > 0 || hasThreatFeeds,
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

type DshieldOptions = {
  userAgent: string;
};

export const fetchDshieldLookupEffect = defineJsonProvider({
  service: "DShield",
  schema: dshieldLookupSnapshotSchema,
  normalize: normalizeIp,
  request: (ip, _options: DshieldOptions) => ({
    url: `https://isc.sans.edu/api/ip/${encodeURIComponent(ip)}?json`,
  }),
  toSnapshot: ({ subject: ip, queriedAt, body }) =>
    parseDshieldBody(ip, queriedAt, child(body, "ip")),
});
