import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { isRecord } from "../parse/coerce";

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

interface VirustotalOptions {
  userAgent?: string;
}

export function fetchVirusTotalLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: VirustotalOptions
): Effect.Effect<VirusTotalLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchVirusTotalLookupGen() {
    const { kind, value } = classifyIpOrHost(queryRaw);
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "VIRUSTOTAL_API_KEY" });
    }

    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.virustotal.lookup");
    const path =
      kind === "ip"
        ? `ip_addresses/${encodeURIComponent(value)}`
        : `domains/${encodeURIComponent(value)}`;
    const url = `https://www.virustotal.com/api/v3/${path}`;

    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "VirusTotal",
      subject: value,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-apikey": key,
          "User-Agent": ua,
        },
      },
    });

    if (status === 404) {
      return virusTotalLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
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
      });
    }

    const data = isRecord(body.data) ? body.data : {};
    const attrs = isRecord(data.attributes) ? data.attributes : {};
    const stats = isRecord(attrs.last_analysis_stats)
      ? attrs.last_analysis_stats
      : {};

    return virusTotalLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      found: true,
      status,
      reputation:
        typeof attrs.reputation === "number" ? attrs.reputation : null,
      malicious: typeof stats.malicious === "number" ? stats.malicious : null,
      suspicious:
        typeof stats.suspicious === "number" ? stats.suspicious : null,
      harmless: typeof stats.harmless === "number" ? stats.harmless : null,
      undetected:
        typeof stats.undetected === "number" ? stats.undetected : null,
      asOwner: typeof attrs.as_owner === "string" ? attrs.as_owner : null,
      asn: typeof attrs.asn === "number" ? attrs.asn : null,
      country: typeof attrs.country === "string" ? attrs.country : null,
      network: typeof attrs.network === "string" ? attrs.network : null,
      registrar: typeof attrs.registrar === "string" ? attrs.registrar : null,
    });
  });
}
