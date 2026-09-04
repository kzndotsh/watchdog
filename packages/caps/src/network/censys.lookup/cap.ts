import { Effect } from "effect";

import { fetchCensysHostEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { censysLookupInput } from "./input";
import { interpretCensysLookupReport } from "./interpret";
import { censysLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.censys.lookup; OSINT)";

export const censysLookup = defineCollectCap({
  id: "network.censys.lookup",
  version: "1",
  title: "Censys lookup",
  description:
    "Internet-wide host view for an IP (services, certs, location labels). Complements Shodan with a different scan corpus.",
  dataSource: "search.censys.io Legacy Search API v2",
  input: censysLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "CENSYS_API_ID" }, { name: "CENSYS_API_SECRET" }],
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: censysLookupSnapshotSchema,
  reportLabel: "censys.lookup",
  fetch: (ctx) =>
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
        { userAgent: UA }
      );
      ctx.log(
        `found=${snap.found} ports=${snap.ports.length} services=${snap.serviceNames.length}`
      );
      return { snap, artifactName: `censys-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretCensysLookupReport,
});
