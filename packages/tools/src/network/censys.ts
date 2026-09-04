import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import { ValidationVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
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
export function fetchCensysHostEffect(
  ipRaw: string,
  apiId: string,
  apiSecret: string,
  signal: AbortSignal,
  options?: { userAgent?: string }
): Effect.Effect<CensysLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchCensysHostGen() {
    const ip = normalizeIp(ipRaw);
    const id = apiId.trim();
    const secret = apiSecret.trim();
    if (!id || !secret) {
      return yield* new ValidationVendorError({
        message: "CENSYS_API_ID and CENSYS_API_SECRET required",
      });
    }

    const ua = options?.userAgent ?? watchdogUserAgent("network.censys.lookup");
    const auth = Buffer.from(`${id}:${secret}`).toString("base64");
    const url = `https://search.censys.io/api/v2/hosts/${encodeURIComponent(ip)}`;

    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "Censys",
      subject: ip,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
          "User-Agent": ua,
        },
      },
    });

    if (status === 404) {
      return censysLookupSnapshotSchema.parse({
        ip,
        queriedAt: new Date().toISOString(),
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
      });
    }

    const result = isRecord(body.result) ? body.result : {};
    const location = isRecord(result.location) ? result.location : {};
    const autonomous = isRecord(result.autonomous_system)
      ? result.autonomous_system
      : {};
    const services = recordRows(result.services);

    const ports: number[] = [];
    const serviceNames: string[] = [];
    for (const svc of services) {
      if (typeof svc.port === "number") ports.push(svc.port);
      if (typeof svc.service_name === "string")
        serviceNames.push(svc.service_name);
    }

    return censysLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      found: true,
      status,
      asn: typeof autonomous.asn === "number" ? autonomous.asn : null,
      asName: typeof autonomous.name === "string" ? autonomous.name : null,
      asCountryCode:
        typeof autonomous.country_code === "string"
          ? autonomous.country_code
          : null,
      countryCode:
        typeof location.country_code === "string"
          ? location.country_code
          : null,
      city: typeof location.city === "string" ? location.city : null,
      ports: [...new Set(ports)].sort((a, b) => a - b),
      serviceNames: [...new Set(serviceNames)],
      hostnames: censysHostnames(result, ip),
    });
  });
}
