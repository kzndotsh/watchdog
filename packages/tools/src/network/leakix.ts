import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { asString, isRecord } from "../parse/coerce";

export const leakixLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain"]),
  queriedAt: z.string().min(1),
  source: z.literal("leakix.net"),
  found: z.boolean(),
  serviceCount: z.number().int(),
  leakCount: z.number().int(),
  protocols: z.array(z.string()),
  hostnames: z.array(z.string()),
});

export type LeakixLookupSnapshot = z.infer<typeof leakixLookupSnapshotSchema>;

const MAX_PROTOCOLS = 5;

function firstArray(body: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

/**
 * LeakIX host/domain lookup — exposed-service + leak counts, no raw leak
 * bodies. `/host/{ip}` for IPs, `/domain/{host}` for hostnames/domains.
 * @see https://docs.leakix.net/docs/api/hostdetails/
 */

interface LeakixOptions {
  userAgent?: string;
}

export function fetchLeakixLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: LeakixOptions
): Effect.Effect<LeakixLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchLeakixLookupGen() {
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "LEAKIX_API_KEY" });
    }

    const { kind, value } = classifyIpOrHost(queryRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("network.leakix.lookup");
    const path = kind === "ip" ? "host" : "domain";
    const url = `https://leakix.net/${path}/${encodeURIComponent(value)}`;

    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "LeakIX",
      subject: value,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "api-key": key,
          "User-Agent": ua,
        },
      },
    });

    if (status === 404) {
      return leakixLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "leakix.net",
        found: false,
        serviceCount: 0,
        leakCount: 0,
        protocols: [],
        hostnames: [],
      });
    }
    const services = firstArray(body, ["Services", "services"]);
    const leaks = firstArray(body, ["Leaks", "leaks"]);

    const protocols = new Set<string>();
    const hostnames = new Set<string>();
    for (const svc of services) {
      if (!isRecord(svc)) continue;
      const protocol = asString(svc.protocol);
      if (protocol) protocols.add(protocol);
      for (const field of ["domain", "hostname", "host"] as const) {
        const name = asString(svc[field])?.trim();
        if (!name || name === value) continue;
        hostnames.add(name);
      }
    }

    return leakixLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "leakix.net",
      found: services.length > 0 || leaks.length > 0,
      serviceCount: services.length,
      leakCount: leaks.length,
      protocols: [...protocols].slice(0, MAX_PROTOCOLS),
      hostnames: [...hostnames],
    });
  });
}
