import { isIP } from "node:net";

import { Effect } from "effect";
import { z } from "zod";

import { expandIpv6 } from "@watchdog/schemas/graph";

import { mapToolsCatch } from "../errors/map-tools-catch";
import type { ToolsTag } from "../errors/tagged-errors";
import { Egress } from "../http/egress";
import { normalizeIp } from "../normalize";

export const dnsReverseSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  hostnames: z.array(z.string()),
});

export type DnsReverseSnapshot = z.infer<typeof dnsReverseSnapshotSchema>;

/** Effect wrapper — invalid IP → tagged `ToolsTag`, not a defect. */
export function normalizeIpEffect(
  raw: string
): Effect.Effect<string, ToolsTag> {
  return Effect.try({
    try: () => normalizeIp(raw),
    catch: mapToolsCatch,
  });
}

/** Dedupe DNS A/AAAA answers; canonicalize equivalent IPv6 spellings. */
export function dedupeResolvedIps(ips: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ips) {
    try {
      const normalized = normalizeIp(raw);
      const key =
        isIP(normalized) === 6
          ? expandIpv6(normalized).toLowerCase()
          : normalized;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(isIP(normalized) === 6 ? normalizeIp(normalized) : normalized);
    } catch {
      /* skip malformed DNS answers */
    }
  }
  return out;
}

function snapshotFromHostnames(
  ip: string,
  hostnames: string[]
): DnsReverseSnapshot {
  const cleaned = [
    ...new Set(
      hostnames.flatMap((h) => {
        const cleanedHost = h.replace(/\.$/, "").toLowerCase();
        return cleanedHost.length > 0 ? [cleanedHost] : [];
      })
    ),
  ];
  return dnsReverseSnapshotSchema.parse({
    ip,
    queriedAt: new Date().toISOString(),
    hostnames: cleaned,
  });
}

/** Reverse DNS (PTR) via the Job's `Egress` — hostnames only, not ownership. */
export function fetchDnsReverseEffect(
  ip: string,
  signal: AbortSignal
): Effect.Effect<DnsReverseSnapshot, ToolsTag, Egress> {
  return Effect.gen(function* fetchDnsReverseGen() {
    const normalized = yield* normalizeIpEffect(ip);
    const egress = yield* Egress;
    const hostnames = yield* egress.resolve(
      { type: "PTR", name: normalized },
      signal
    );
    return snapshotFromHostnames(normalized, hostnames);
  });
}
