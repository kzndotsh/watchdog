import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchIpinfoLookupEffect,
  ipinfoLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ipinfo } from "../../providers";
import { ipinfoLookupInput } from "./input";
import { interpretIpinfoLookupReport } from "./interpret";

export const ipinfoLookup = defineCollectCap({
  id: "network.ipinfo.lookup",
  version: "1",
  provider: ipinfo,
  title: "IPinfo lookup",
  description:
    "Geo and org context for an IP (city/region/country, ASN org string). Complements Team Cymru ASN with GeoIP-style labels — not ownership.",
  dataSource: "ipinfo.io",
  input: ipinfoLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "IPINFO_API_TOKEN" }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: ipinfoLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* ipinfoLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`IPinfo lookup ${ip}`);
      const token = yield* ctx.getCredential("IPINFO_API_TOKEN");
      const snap = yield* fetchIpinfoLookupEffect(ip, token, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} org=${snap.org ?? "none"}`);
      return { snap, artifactName: `ipinfo-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretIpinfoLookupReport,
});
