import { Effect } from "effect";

import { fetchIpinfoLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ipinfoLookupInput } from "./input";
import { interpretIpinfoLookupReport } from "./interpret";
import { ipinfoLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.ipinfo.lookup; OSINT)";

export const ipinfoLookup = defineCollectCap({
  id: "network.ipinfo.lookup",
  version: "1",
  title: "IPinfo lookup",
  description:
    "Geo and org context for an IP (city/region/country, ASN org string). Complements Team Cymru ASN with GeoIP-style labels — not ownership.",
  dataSource: "ipinfo.io",
  input: ipinfoLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
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
  reportLabel: "ipinfo.lookup",
  fetch: (ctx) =>
    Effect.gen(function* ipinfoLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`IPinfo lookup ${ip}`);
      const token = yield* ctx.getCredential("IPINFO_API_TOKEN");
      const snap = yield* fetchIpinfoLookupEffect(ip, token, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} org=${snap.org ?? "none"}`);
      return { snap, artifactName: `ipinfo-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretIpinfoLookupReport,
});
