import { isIP } from "node:net";

import { Effect } from "effect";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";
import { canonicalIpLiteral, expandIpv6 } from "../network/ip-lookup-cymru";
import {
  assertNotAborted,
  dnsOrEmpty,
  withAbortableResolver,
} from "./abortable-resolver";

export const dnsReverseSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  hostnames: z.array(z.string()),
});

export type DnsReverseSnapshot = z.infer<typeof dnsReverseSnapshotSchema>;

/** Normalize and validate an IPv4/IPv6 address string. */
export function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (!isIP(trimmed)) {
    throw validationToolsError(`Invalid IP address: ${raw}`);
  }
  return trimmed;
}

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
      out.push(
        isIP(normalized) === 6 ? canonicalIpLiteral(normalized) : normalized
      );
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
      hostnames
        .map((h) => h.replace(/\.$/, "").toLowerCase())
        .filter((h) => h.length > 0)
    ),
  ];
  return dnsReverseSnapshotSchema.parse({
    ip,
    queriedAt: new Date().toISOString(),
    hostnames: cleaned,
  });
}

/** Reverse DNS (PTR) via system resolver — hostnames only, not ownership. */
export function fetchDnsReverseEffect(
  ip: string,
  signal: AbortSignal
): Effect.Effect<DnsReverseSnapshot, ToolsTag> {
  return Effect.gen(function* fetchDnsReverseGen() {
    const normalized = yield* normalizeIpEffect(ip);
    const { resolver, cleanup } = withAbortableResolver(
      signal,
      "DNS reverse aborted"
    );
    const hostnames = yield* dnsOrEmpty(
      () => resolver.reverse(normalized),
      [] as string[]
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          cleanup();
        })
      )
    );
    yield* Effect.try({
      try: () => {
        assertNotAborted(signal, "DNS reverse aborted");
      },
      catch: mapToolsCatch,
    });
    return snapshotFromHostnames(normalized, hostnames);
  });
}
