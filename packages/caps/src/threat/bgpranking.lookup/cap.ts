import { Effect } from "effect";

import { fetchBgprankingLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { bgprankingLookupInput } from "./input";
import { interpretBgprankingLookupReport } from "./interpret";
import { bgprankingLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.bgpranking.lookup; OSINT)";

export const bgprankingLookup = defineCollectCap({
  id: "threat.bgpranking.lookup",
  version: "1",
  title: "CIRCL BGP Ranking",
  description:
    "Malicious-activity rank for an IP’s origin ASN (CIRCL). Useful when judging how noisy the whole ASN is.",
  dataSource: "bgpranking-ng.circl.lu",
  input: bgprankingLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: bgprankingLookupSnapshotSchema,
  reportLabel: "bgpranking.lookup",
  fetch: (ctx) =>
    Effect.gen(function* bgprankingLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`CIRCL BGP Ranking ${ip}`);
      const snap = yield* fetchBgprankingLookupEffect(ip, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `found=${snap.found} asn=${snap.asn ?? "n/a"} rank=${snap.asnRank ?? "n/a"}`
      );
      return {
        snap,
        artifactName: `bgpranking-${ip.replaceAll(":", "-")}.json`,
      };
    }),
  interpretSnap: interpretBgprankingLookupReport,
});
