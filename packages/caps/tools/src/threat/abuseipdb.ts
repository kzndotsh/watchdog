import { z } from "zod";

import {
  bool,
  child,
  defineJsonProvider,
  num,
  pick,
  str,
} from "../http/define-json-provider";
import { normalizeIp } from "../normalize";

export const abuseIpdbLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  status: z.number().int().nullable(),
  abuseConfidenceScore: z.number().nullable(),
  totalReports: z.number().int().nullable(),
  numDistinctUsers: z.number().int().nullable(),
  lastReportedAt: z.string().nullable(),
  isPublic: z.boolean().nullable(),
  isWhitelisted: z.boolean().nullable(),
  isp: z.string().nullable(),
  domain: z.string().nullable(),
  usageType: z.string().nullable(),
  countryCode: z.string().nullable(),
});

export type AbuseIpdbLookupSnapshot = z.infer<
  typeof abuseIpdbLookupSnapshotSchema
>;

/**
 * AbuseIPDB APIv2 check —
 * GET https://api.abuseipdb.com/api/v2/check?ipAddress=
 * Auth: Key header.
 * @see https://docs.abuseipdb.com/
 */

type AbuseipdbOptions = {
  userAgent: string;
  maxAgeInDays?: number;
};

export const fetchAbuseIpdbCheckEffect = defineJsonProvider({
  service: "AbuseIPDB",
  schema: abuseIpdbLookupSnapshotSchema,
  key: { header: "Key" },
  normalize: normalizeIp,
  request: (ip, options: AbuseipdbOptions) => {
    const url = new URL("https://api.abuseipdb.com/api/v2/check");
    url.searchParams.set("ipAddress", ip);
    url.searchParams.set("maxAgeInDays", String(options.maxAgeInDays ?? 90));
    return { url };
  },
  toSnapshot: ({ subject: ip, queriedAt, status, body }) => ({
    ip,
    queriedAt,
    found: true,
    status,
    ...pick(child(body, "data"), {
      abuseConfidenceScore: num(),
      totalReports: num(),
      numDistinctUsers: num(),
      lastReportedAt: str(),
      isPublic: bool(),
      isWhitelisted: bool(),
      isp: str(),
      domain: str(),
      usageType: str(),
      countryCode: str(),
    }),
  }),
});
