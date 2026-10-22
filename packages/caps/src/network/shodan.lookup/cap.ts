import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchShodanHostEffect,
  shodanLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { shodan } from "../../providers";
import { shodanLookupInput } from "./input";
import { interpretShodanLookupReport } from "./interpret";

export const shodanLookup = defineCollectCap({
  id: "network.shodan.lookup",
  version: "1",
  provider: shodan,
  title: "Shodan lookup",
  description:
    "See what Shodan's internet-wide scans found on an IP address: open ports, service banners and hostnames.",
  dataSource: "api.shodan.io",
  input: shodanLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "SHODAN_API_KEY" }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: shodanLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* shodanLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Shodan ${ip}`);
      const key = yield* ctx.getCredential("SHODAN_API_KEY");
      const snap = yield* fetchShodanHostEffect(ip, key, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `found=${snap.found} hostnames=${snap.hostnames.length} ports=${snap.ports.length}`
      );
      return { snap, artifactName: `shodan-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretShodanLookupReport,
});
