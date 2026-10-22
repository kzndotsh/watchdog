import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchIpctlLookupEffect,
  ipctlLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ipctlLookupInput } from "./input";
import { interpretIpctlLookupReport } from "./interpret";

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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* ipctlLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`ipctl ${ip}`);
      const snap = yield* fetchIpctlLookupEffect(ip, ctx.signal, {
        userAgent,
      });
      ctx.log(`asn=${snap.asn ?? "none"} prefix=${snap.bgpPrefix ?? "none"}`);
      return { snap, artifactName: `ipctl-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretIpctlLookupReport,
});
