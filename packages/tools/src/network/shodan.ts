import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import { normalizeIpEffect } from "../dns/reverse";
import {
  MissingCredentialError,
  ParseVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { nowIsoStringEffect } from "../infra/clock";

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

const optionalString = z.string().nullish();

/** Fields read from Shodan's minified host body; a wrong type is a vendor parse failure. */
const shodanHostBodySchema = z.object({
  org: optionalString,
  isp: optionalString,
  asn: optionalString,
  hostnames: z.array(z.string()).nullish(),
  ports: z.array(z.number().int()).nullish(),
  tags: z.array(z.string()).nullish(),
  os: optionalString,
  country_code: optionalString,
  city: optionalString,
  last_update: optionalString,
});

function snapshotFromBody(
  ip: string,
  queriedAt: string,
  status: number,
  body: Record<string, unknown>
): ShodanLookupSnapshot | undefined {
  const parsed = shodanHostBodySchema.safeParse(body);
  if (!parsed.success) return undefined;
  const host = parsed.data;
  const snapshot = shodanLookupSnapshotSchema.safeParse({
    ip,
    queriedAt,
    found: true,
    status,
    org: host.org ?? null,
    isp: host.isp ?? null,
    asn: host.asn ?? null,
    hostnames: host.hostnames ?? [],
    ports: host.ports ?? [],
    tags: host.tags ?? [],
    os: host.os ?? null,
    countryCode: host.country_code ?? null,
    city: host.city ?? null,
    lastUpdate: host.last_update ?? null,
  });
  return snapshot.success ? snapshot.data : undefined;
}

export function fetchShodanHostEffect(
  ipRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: ShodanOptions
): Effect.Effect<ShodanLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchShodanHostGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const ip = yield* normalizeIpEffect(ipRaw);
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
        queriedAt,
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

    const snapshot = snapshotFromBody(ip, queriedAt, status, body);
    if (snapshot === undefined) {
      return yield* new ParseVendorError({ service: "Shodan", subject: ip });
    }
    return snapshot;
  });
}
