import { z } from "zod";

import { child, defineJsonProvider } from "../http/define-json-provider";
import { normalizeIp } from "../normalize";
import { asString, isRecord } from "../parse/coerce";

export const honeydbLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("honeydb.io"),
  found: z.boolean(),
  asn: z.number().int().nullable(),
  country: z.string().nullable(),
  isTor: z.boolean(),
  isThreat: z.boolean(),
  internetScanner: z.boolean(),
  historyEventCount: z.number().int(),
});

export type HoneydbLookupSnapshot = z.infer<typeof honeydbLookupSnapshotSchema>;

/** The vendor's API id rides in the options: the key placement carries only the key. */
type HoneydbOptions = { userAgent: string; id: string };

function toEventCount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw);
  return Number.NaN;
}

function sumHistoryEvents(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const n = toEventCount(row.event_count);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/**
 * HoneyDB `ip-context` — network info + threat-list flags + honeypot
 * observation history for an IP. Community feed (~1000 req/day),
 * non-commercial ToS.
 * GET https://honeydb.io/api/ip-context/{ip}
 * @see https://honeydb.io/mssp-aisoc
 */
const lookupHoneydb = defineJsonProvider({
  service: "HoneyDB",
  schema: honeydbLookupSnapshotSchema,
  key: { header: "X-HoneyDb-ApiKey" },
  normalize: normalizeIp,
  request: (ip, options: HoneydbOptions) => ({
    url: `https://honeydb.io/api/ip-context/${encodeURIComponent(ip)}`,
    headers: { "X-HoneyDb-ApiId": options.id },
  }),
  notFound: ({ subject: ip, queriedAt }) => ({
    ip,
    queriedAt,
    source: "honeydb.io" as const,
    found: false,
    asn: null,
    country: null,
    isTor: false,
    isThreat: false,
    internetScanner: false,
    historyEventCount: 0,
  }),
  toSnapshot: ({ subject: ip, queriedAt, body }) => {
    const networkInfo = child(body, "network_info");
    const threatInfo = child(body, "threat_info");
    return {
      ip,
      queriedAt,
      source: "honeydb.io" as const,
      found: true,
      asn: typeof networkInfo.asn === "number" ? networkInfo.asn : null,
      country: asString(networkInfo.country),
      isTor: threatInfo.is_tor === true,
      isThreat: threatInfo.is_threat === true,
      internetScanner: body.internet_scanner === true,
      historyEventCount: sumHistoryEvents(body.ip_history),
    };
  },
});

export function fetchHoneydbLookupEffect(
  ipRaw: string,
  id: string,
  key: string,
  signal: AbortSignal,
  options: { userAgent: string }
) {
  return lookupHoneydb(ipRaw, key, signal, { ...options, id });
}
