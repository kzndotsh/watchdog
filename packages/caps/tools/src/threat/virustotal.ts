import { z } from "zod";

import {
  child,
  defineJsonProvider,
  num,
  pick,
  str,
} from "../http/define-json-provider";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";

export const virusTotalLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain"]),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  status: z.number().int().nullable(),
  reputation: z.number().nullable(),
  malicious: z.number().int().nullable(),
  suspicious: z.number().int().nullable(),
  harmless: z.number().int().nullable(),
  undetected: z.number().int().nullable(),
  asOwner: z.string().nullable(),
  asn: z.number().int().nullable(),
  country: z.string().nullable(),
  network: z.string().nullable(),
  registrar: z.string().nullable(),
});

export type VirusTotalLookupSnapshot = z.infer<
  typeof virusTotalLookupSnapshotSchema
>;

/**
 * VirusTotal v3 IP or domain report.
 * GET /api/v3/ip_addresses/{ip} | /api/v3/domains/{domain}
 * Auth: x-apikey header.
 * @see https://docs.virustotal.com/reference/ip-info
 */

type VirustotalOptions = {
  userAgent: string;
};

export const fetchVirusTotalLookupEffect = defineJsonProvider({
  service: "VirusTotal",
  schema: virusTotalLookupSnapshotSchema,
  key: { header: "x-apikey" },
  normalize: classifyIpOrHost,
  request: ({ kind, value }, _options: VirustotalOptions) => ({
    url: `https://www.virustotal.com/api/v3/${kind === "ip" ? "ip_addresses" : "domains"}/${encodeURIComponent(value)}`,
  }),
  notFound: ({ subject: { kind, value }, queriedAt }) => ({
    query: value,
    kind,
    queriedAt,
    found: false,
    status: 404,
    reputation: null,
    malicious: null,
    suspicious: null,
    harmless: null,
    undetected: null,
    asOwner: null,
    asn: null,
    country: null,
    network: null,
    registrar: null,
  }),
  toSnapshot: ({ subject: { kind, value }, queriedAt, status, body }) => {
    const attrs = child(child(body, "data"), "attributes");
    return {
      query: value,
      kind,
      queriedAt,
      found: true,
      status,
      ...pick(attrs, {
        reputation: num(),
        asOwner: str("as_owner"),
        asn: num(),
        country: str(),
        network: str(),
        registrar: str(),
      }),
      ...pick(child(attrs, "last_analysis_stats"), {
        malicious: num(),
        suspicious: num(),
        harmless: num(),
        undetected: num(),
      }),
    };
  },
});
