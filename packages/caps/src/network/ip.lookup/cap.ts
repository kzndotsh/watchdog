import { Effect } from "effect";

import { fetchIpLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ipLookupInput } from "./input";
import { interpretIpLookupReport } from "./interpret";
import { ipLookupSnapshotSchema } from "./report-schema";

export const ipLookup = defineCollectCap({
  id: "network.ip.lookup",
  version: "1",
  title: "IP lookup",
  description:
    "Team Cymru DNS IP→ASN and RIR-assigned country code. Country here is not GeoIP; use for routing context.",
  dataSource: "Team Cymru DNS (origin.asn.cymru.com)",
  input: ipLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: ipLookupSnapshotSchema,
  reportLabel: "ip.lookup",
  fetch: (ctx) =>
    Effect.gen(function* ipLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Cymru IP lookup ${ip}`);
      const snap = yield* fetchIpLookupEffect(ip, ctx.signal);
      ctx.log(`asn=${snap.asn ?? "none"} prefix=${snap.bgpPrefix ?? "none"}`);
      return {
        snap,
        artifactName: `ip-lookup-${ip.replaceAll(":", "-")}.json`,
      };
    }),
  interpretSnap: interpretIpLookupReport,
});
