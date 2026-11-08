import { z } from "zod";

import {
  child,
  defineJsonProvider,
  num,
  pick,
  str,
} from "../http/define-json-provider";
import { normalizeIp } from "../normalize";
import { isRecord, recordRows } from "../parse/coerce";

export const censysLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  status: z.number().int().nullable(),
  asn: z.number().int().nullable(),
  asName: z.string().nullable(),
  asCountryCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  city: z.string().nullable(),
  ports: z.array(z.number().int()),
  serviceNames: z.array(z.string()),
  hostnames: z.array(z.string()),
});

export type CensysLookupSnapshot = z.infer<typeof censysLookupSnapshotSchema>;

function censysHostnames(
  result: Record<string, unknown>,
  ip: string
): string[] {
  const names = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === ip) return;
    names.add(trimmed);
  };
  add(result.name);
  const dns = isRecord(result.dns) ? result.dns : {};
  if (Array.isArray(dns.names)) {
    for (const name of dns.names) add(name);
  }
  return [...names];
}

/**
 * Censys Legacy Search host view —
 * GET https://search.censys.io/api/v2/hosts/{ip} (HTTP Basic: API ID + secret).
 * @see https://docs.censys.com/docs/ls-api
 */
const lookupCensysHost = defineJsonProvider({
  service: "Censys",
  schema: censysLookupSnapshotSchema,
  key: "basic",
  normalize: normalizeIp,
  request: (ip, _options: { userAgent: string }) => ({
    url: `https://search.censys.io/api/v2/hosts/${encodeURIComponent(ip)}`,
  }),
  notFound: ({ subject: ip, queriedAt }) => ({
    ip,
    queriedAt,
    found: false,
    status: 404,
    asn: null,
    asName: null,
    asCountryCode: null,
    countryCode: null,
    city: null,
    ports: [],
    serviceNames: [],
    hostnames: [],
  }),
  toSnapshot: ({ subject: ip, queriedAt, status, body }) => {
    const result = child(body, "result");
    const autonomous = pick(child(result, "autonomous_system"), {
      asn: num(),
      name: str(),
      countryCode: str("country_code"),
    });
    const location = pick(child(result, "location"), {
      countryCode: str("country_code"),
      city: str(),
    });
    const ports: number[] = [];
    const serviceNames: string[] = [];
    for (const svc of recordRows(result.services)) {
      if (typeof svc.port === "number") ports.push(svc.port);
      if (typeof svc.service_name === "string")
        serviceNames.push(svc.service_name);
    }
    return {
      ip,
      queriedAt,
      found: true,
      status,
      asn: autonomous.asn,
      asName: autonomous.name,
      asCountryCode: autonomous.countryCode,
      countryCode: location.countryCode,
      city: location.city,
      ports: [...new Set(ports)].sort((a, b) => a - b),
      serviceNames: [...new Set(serviceNames)],
      hostnames: censysHostnames(result, ip),
    };
  },
});

export function fetchCensysHostEffect(
  ipRaw: string,
  id: string,
  secret: string,
  signal: AbortSignal,
  options: { userAgent: string }
) {
  return lookupCensysHost(ipRaw, `${id}:${secret}`, signal, options);
}
