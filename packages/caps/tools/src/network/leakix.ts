import { z } from "zod";

import { defineJsonProvider } from "../http/define-json-provider";
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

type LeakixOptions = {
  userAgent: string;
};

export const fetchLeakixLookupEffect = defineJsonProvider({
  service: "LeakIX",
  schema: leakixLookupSnapshotSchema,
  key: { header: "api-key" },
  normalize: classifyIpOrHost,
  request: ({ kind, value }, _options: LeakixOptions) => ({
    url: `https://leakix.net/${kind === "ip" ? "host" : "domain"}/${encodeURIComponent(value)}`,
  }),
  notFound: ({ subject: { kind, value }, queriedAt }) => ({
    query: value,
    kind,
    queriedAt,
    source: "leakix.net" as const,
    found: false,
    serviceCount: 0,
    leakCount: 0,
    protocols: [],
    hostnames: [],
  }),
  toSnapshot: ({ subject: { kind, value }, queriedAt, body }) => {
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

    return {
      query: value,
      kind,
      queriedAt,
      source: "leakix.net" as const,
      found: true,
      serviceCount: services.length,
      leakCount: leaks.length,
      protocols: [...protocols].slice(0, MAX_PROTOCOLS),
      hostnames: [...hostnames],
    };
  },
});
