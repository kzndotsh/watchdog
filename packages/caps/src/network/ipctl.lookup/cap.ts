import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchIpctlLookupEffect,
  ipctlLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ipctl } from "../../providers";
import { contact } from "../../sdk";
import { ipctlLookupInput } from "./input";
import { interpretIpctlLookupReport } from "./interpret";

export const ipctlLookup = defineCollectCap({
  id: "network.ipctl.lookup",
  provider: ipctl,
  contacts: [contact.provider("api.ipctl.io")],
  title: "ipctl IP lookup",
  description:
    "Find the network behind an IP address: its ASN, routed prefix and RPKI status, with geolocation shown separately.",
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
