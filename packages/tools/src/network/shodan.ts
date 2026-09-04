import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";

export const shodanLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  status: z.number().int().nullable(),
  org: z.string().nullable(),
  isp: z.string().nullable(),
  asn: z.string().nullable(),
  hostnames: z.array(z.string()),
  ports: z.array(z.number().int()),
  tags: z.array(z.string()),
  os: z.string().nullable(),
  countryCode: z.string().nullable(),
  city: z.string().nullable(),
  lastUpdate: z.string().nullable(),
});

export type ShodanLookupSnapshot = z.infer<typeof shodanLookupSnapshotSchema>;

/**
 * Shodan host lookup — GET /shodan/host/{ip}?key=&minify=true
 * @see https://developer.shodan.io/api
 */

interface ShodanOptions {
  userAgent?: string;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number")
    : [];
}

function snapshotFromBody(
  ip: string,
  status: number,
  body: Record<string, unknown>
): ShodanLookupSnapshot {
  return shodanLookupSnapshotSchema.parse({
    ip,
    queriedAt: new Date().toISOString(),
    found: true,
    status,
    org: typeof body.org === "string" ? body.org : null,
    isp: typeof body.isp === "string" ? body.isp : null,
    asn: typeof body.asn === "string" ? body.asn : null,
    hostnames: stringList(body.hostnames),
    ports: numberList(body.ports),
    tags: stringList(body.tags),
    os: typeof body.os === "string" ? body.os : null,
    countryCode:
      typeof body.country_code === "string" ? body.country_code : null,
    city: typeof body.city === "string" ? body.city : null,
    lastUpdate: typeof body.last_update === "string" ? body.last_update : null,
  });
}

export function fetchShodanHostEffect(
  ipRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: ShodanOptions
): Effect.Effect<ShodanLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchShodanHostGen() {
    const ip = normalizeIp(ipRaw);
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "SHODAN_API_KEY" });
    }

    const ua = options?.userAgent ?? watchdogUserAgent("network.shodan.lookup");
    const url = new URL(
      `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}`
    );
    url.searchParams.set("key", key);
    url.searchParams.set("minify", "true");

    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "Shodan",
      subject: ip,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });

    if (status === 404) {
      return shodanLookupSnapshotSchema.parse({
        ip,
        queriedAt: new Date().toISOString(),
        found: false,
        status: 404,
        org: null,
        isp: null,
        asn: null,
        hostnames: [],
        ports: [],
        tags: [],
        os: null,
        countryCode: null,
        city: null,
        lastUpdate: null,
      });
    }

    return snapshotFromBody(ip, status, body);
  });
}
