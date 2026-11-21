import { Effect } from "effect";
import { z } from "zod";

import { normalizeIpEffect } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { Egress } from "../http/egress";
import { nowIsoStringEffect } from "../infra/clock";
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
): Effect.Effect<IpLookupSnapshot, ToolsTag, Egress> {
  return Effect.gen(function* fetchIpLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const ip = yield* normalizeIpEffect(ipRaw);
    const egress = yield* Egress;
    const originName = originLookupName(ip);
    const originChunks = yield* egress.resolve(
      { type: "TXT", name: originName },
      signal
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
      const asChunks = yield* egress.resolve(
        { type: "TXT", name: `AS${primary}.asn.cymru.com` },
        signal
      );
      if (asChunks.length > 0) {
        rawAs = stripTxtQuotes(asChunks[0]?.join("") ?? "");
        asName = parseCymruAsName(rawAs);
      }
    }

    return ipLookupSnapshotSchema.parse({
      ip,
      queriedAt,
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
  });
}
