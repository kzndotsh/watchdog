import { Effect } from "effect";

import { fetchIpctlLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ipctlLookupInput } from "./input";
import { interpretIpctlLookupReport } from "./interpret";
import { ipctlLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.ipctl.lookup; OSINT)";

export const ipctlLookup = defineCollectCap({
  id: "network.ipctl.lookup",
  version: "1",
  title: "ipctl IP lookup",
  description:
    "IP→BGP context (ASN, prefix, RPKI) with GeoIP labeled separately — modern BGPView-style footprint.",
  dataSource: "api.ipctl.io",
  input: ipctlLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: ipctlLookupSnapshotSchema,
  reportLabel: "ipctl.lookup",
  fetch: (ctx) =>
    Effect.gen(function* ipctlLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`ipctl ${ip}`);
      const snap = yield* fetchIpctlLookupEffect(ip, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`asn=${snap.asn ?? "none"} prefix=${snap.bgpPrefix ?? "none"}`);
      return { snap, artifactName: `ipctl-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretIpctlLookupReport,
});
