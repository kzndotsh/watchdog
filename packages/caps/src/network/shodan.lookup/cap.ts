import { Effect } from "effect";

import { fetchShodanHostEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { shodanLookupInput } from "./input";
import { interpretShodanLookupReport } from "./interpret";
import { shodanLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.shodan.lookup; OSINT)";

export const shodanLookup = defineCollectCap({
  id: "network.shodan.lookup",
  version: "1",
  title: "Shodan lookup",
  description:
    "Internet-wide host metadata for an IP (ports, banners, hostnames). Complements Censys / http_probe.",
  dataSource: "api.shodan.io",
  input: shodanLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "SHODAN_API_KEY" }],
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: shodanLookupSnapshotSchema,
  reportLabel: "shodan.lookup",
  fetch: (ctx) =>
    Effect.gen(function* shodanLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Shodan ${ip}`);
      const key = yield* ctx.getCredential("SHODAN_API_KEY");
      const snap = yield* fetchShodanHostEffect(ip, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `found=${snap.found} hostnames=${snap.hostnames.length} ports=${snap.ports.length}`
      );
      return { snap, artifactName: `shodan-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretShodanLookupReport,
});
