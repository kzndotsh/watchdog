import { Effect } from "effect";
import { z } from "zod";

import { dnsOrEmpty, runAbortableResolver } from "../dns/abortable-resolver";
import { normalizeIp } from "../dns/reverse";
import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import {
  originLookupName,
  parseCymruAsName,
  parseCymruOriginTxt,
  stripTxtQuotes,
} from "./ip-lookup-cymru";

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

function emptyOriginFields() {
  return {
    asns: [] as string[],
    bgpPrefix: null as string | null,
    countryCode: null as string | null,
    registry: null as string | null,
    allocated: null as string | null,
  };
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

          const fields = rawOrigin
            ? parseCymruOriginTxt(rawOrigin)
            : emptyOriginFields();

          let asName: string | null = null;
          let rawAs: string | null = null;
          const primary = fields.asns[0];
          if (primary) {
            const asChunks = yield* dnsOrEmpty(
              () => resolver.resolveTxt(`AS${primary}.asn.cymru.com`),
              [] as string[][]
            );
            if (asChunks.length > 0) {
              rawAs = stripTxtQuotes(asChunks[0]?.join("") ?? "");
              asName = parseCymruAsName(rawAs);
            }
          }

          return ipLookupSnapshotSchema.parse({
            ip,
            queriedAt: new Date().toISOString(),
            source: "team-cymru-dns",
            asn: fields.asns[0] ?? null,
            asns: fields.asns,
            bgpPrefix: fields.bgpPrefix,
            countryCode: fields.countryCode,
            registry: fields.registry,
            allocated: fields.allocated,
            asName,
            rawOrigin,
            rawAs,
          });
        })
    );
  });
}
