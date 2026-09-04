import { isIP } from "node:net";

import { Effect } from "effect";
import { z } from "zod";

import { dnsOrEmpty, runAbortableResolver } from "../dns/abortable-resolver";
import { normalizeIp } from "../dns/reverse";
import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";

export const ipLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("team-cymru-dns"),
  asn: z.string().nullable(),
  /** Pipe-joined when multiple origin ASNs. */
  asns: z.array(z.string()),
  bgpPrefix: z.string().nullable(),
  /** RIR-assigned country code — not GeoIP. */
  countryCode: z.string().nullable(),
  registry: z.string().nullable(),
  allocated: z.string().nullable(),
  asName: z.string().nullable(),
  rawOrigin: z.string().nullable(),
  rawAs: z.string().nullable(),
});

export type IpLookupSnapshot = z.infer<typeof ipLookupSnapshotSchema>;

function stripTxtQuotes(s: string): string {
  return s.replaceAll(/^"|"$/g, "").trim();
}

function expandIpv6(ip: string): string {
  const parts = ip.split("::");
  if (parts.length > 2) throw validationToolsError(`Invalid IPv6: ${ip}`);
  const head =
    parts[0] !== undefined && parts[0] !== "" ? parts[0].split(":") : [];
  const tail =
    parts[1] !== undefined && parts[1] !== "" ? parts[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  const full = [
    ...head,
    ...Array.from({ length: Math.max(missing, 0) }, () => "0"),
    ...tail,
  ];
  if (full.length !== 8) throw validationToolsError(`Invalid IPv6: ${ip}`);
  return full.map((h) => h.padStart(4, "0")).join(":");
}

function originLookupName(ip: string): string {
  const ver = isIP(ip);
  if (ver === 4) {
    // oxlint-disable-next-line unicorn/no-array-reverse -- toReversed() needs ES2023 lib, unavailable in consumers' tsconfig target; split() already returns a fresh, unshared array so reversing in place is safe
    const reversed = ip.split(".").reverse();
    return `${reversed.join(".")}.origin.asn.cymru.com`;
  }
  if (ver === 6) {
    const hex = expandIpv6(ip).replaceAll(":", "");
    // oxlint-disable-next-line typescript/no-misused-spread -- hex nibbles are ASCII-only, safe to iterate by code point
    const nibbleChars = [...hex];
    // oxlint-disable-next-line unicorn/no-array-reverse -- see reasoning above; nibbleChars is a fresh, unshared array
    const nibbles = nibbleChars.reverse().join(".");
    return `${nibbles}.origin6.asn.cymru.com`;
  }
  throw validationToolsError(`Invalid IP address: ${ip}`);
}

/**
 * Team Cymru IP→ASN via DNS (origin.asn.cymru.com / origin6 + AS description).
 * Country/registry are RIR-assigned — not GeoIP.
 */
export function fetchIpLookupEffect(
  ipRaw: string,
  signal: AbortSignal
): Effect.Effect<IpLookupSnapshot, ToolsTag> {
  return Effect.gen(function* fetchIpLookupGen() {
    const ip = yield* Effect.try({
      try: () => normalizeIp(ipRaw),
      catch: mapToolsCatch,
    });
    return yield* runAbortableResolver(
      signal,
      "IP lookup aborted",
      (resolver) =>
        Effect.gen(function* fetchIpLookupDnsGen() {
          const originName = originLookupName(ip);
          const originChunks = yield* dnsOrEmpty(
            () => resolver.resolveTxt(originName),
            [] as string[][]
          );

          const rawOrigin =
            originChunks.length > 0
              ? stripTxtQuotes(originChunks[0]?.join("") ?? "")
              : null;

          let asns: string[] = [];
          let bgpPrefix: string | null = null;
          let countryCode: string | null = null;
          let registry: string | null = null;
          let allocated: string | null = null;
          let asName: string | null = null;
          let rawAs: string | null = null;

          if (rawOrigin) {
            const parts = rawOrigin.split("|").map((p) => p.trim());
            asns = (parts[0] ?? "")
              .split(/\s+/)
              .map((a) => a.trim())
              .filter(Boolean);
            bgpPrefix = parts[1] || null;
            countryCode = parts[2] || null;
            registry = parts[3] || null;
            allocated = parts[4] || null;

            const primary = asns[0];
            if (primary) {
              const asChunks = yield* dnsOrEmpty(
                () => resolver.resolveTxt(`AS${primary}.asn.cymru.com`),
                [] as string[][]
              );
              if (asChunks.length > 0) {
                rawAs = stripTxtQuotes(asChunks[0]?.join("") ?? "");
                const asParts = rawAs.split("|").map((p) => p.trim());
                asName = asParts[4] || null;
              }
            }
          }

          return ipLookupSnapshotSchema.parse({
            ip,
            queriedAt: new Date().toISOString(),
            source: "team-cymru-dns",
            asn: asns[0] ?? null,
            asns,
            bgpPrefix,
            countryCode,
            registry,
            allocated,
            asName,
            rawOrigin,
            rawAs,
          });
        })
    );
  });
}
