import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchIpLookupEffect,
  ipLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { teamCymru } from "../../providers";
import { ipLookupInput } from "./input";
import { interpretIpLookupReport } from "./interpret";

export const ipLookup = defineCollectCap({
  id: "network.ip.lookup",
  version: "1",
  provider: teamCymru,
  title: "IP lookup",
  description:
    "Find the network (ASN) behind an IP address and the country it was registered in, via Team Cymru. The registration country is not where the server is.",
  dataSource: "Team Cymru DNS (origin.asn.cymru.com)",
  input: ipLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: ipLookupSnapshotSchema,
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
