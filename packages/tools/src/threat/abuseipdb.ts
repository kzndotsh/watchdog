import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { isRecord } from "../parse/coerce";

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

interface AbuseipdbOptions {
  userAgent?: string;
  maxAgeInDays?: number;
}

export function fetchAbuseIpdbCheckEffect(
  ipRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: AbuseipdbOptions
): Effect.Effect<AbuseIpdbLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchAbuseIpdbCheckGen() {
    const ip = normalizeIp(ipRaw);
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "ABUSEIPDB_API_KEY" });
    }

    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.abuseipdb.lookup");
    const url = new URL("https://api.abuseipdb.com/api/v2/check");
    url.searchParams.set("ipAddress", ip);
    url.searchParams.set("maxAgeInDays", String(options?.maxAgeInDays ?? 90));

    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "AbuseIPDB",
      subject: ip,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          Key: key,
          "User-Agent": ua,
        },
      },
    });
    const data = isRecord(body.data) ? body.data : {};

    return abuseIpdbLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      found: true,
      status,
      abuseConfidenceScore:
        typeof data.abuseConfidenceScore === "number"
          ? data.abuseConfidenceScore
          : null,
      totalReports:
        typeof data.totalReports === "number" ? data.totalReports : null,
      numDistinctUsers:
        typeof data.numDistinctUsers === "number"
          ? data.numDistinctUsers
          : null,
      lastReportedAt:
        typeof data.lastReportedAt === "string" ? data.lastReportedAt : null,
      isPublic: typeof data.isPublic === "boolean" ? data.isPublic : null,
      isWhitelisted:
        typeof data.isWhitelisted === "boolean" ? data.isWhitelisted : null,
      isp: typeof data.isp === "string" ? data.isp : null,
      domain: typeof data.domain === "string" ? data.domain : null,
      usageType: typeof data.usageType === "string" ? data.usageType : null,
      countryCode:
        typeof data.countryCode === "string" ? data.countryCode : null,
    });
  });
}
