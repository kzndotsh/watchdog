import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchCensysHostEffect,
  censysLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { censys } from "../../providers";
import { censysLookupInput } from "./input";
import { interpretCensysLookupReport } from "./interpret";

export const censysLookup = defineCollectCap({
  id: "network.censys.lookup",
  provider: censys,
  title: "Censys lookup",
  description:
    "See what Censys's internet-wide scans found on an IP address: services, certificates and location. A different scan source from Shodan.",
  dataSource: "search.censys.io Legacy Search API v2",
  input: censysLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "CENSYS_API_ID" }, { name: "CENSYS_API_SECRET" }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: censysLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* censysLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Censys ${ip}`);
      const apiId = yield* ctx.getCredential("CENSYS_API_ID");
      const apiSecret = yield* ctx.getCredential("CENSYS_API_SECRET");
      const snap = yield* fetchCensysHostEffect(
        ip,
        apiId,
        apiSecret,
        ctx.signal,
        { userAgent }
      );
      ctx.log(
        `found=${snap.found} ports=${snap.ports.length} services=${snap.serviceNames.length}`
      );
      return { snap, artifactName: `censys-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretCensysLookupReport,
});
