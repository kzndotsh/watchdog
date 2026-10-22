import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchBgprankingLookupEffect,
  bgprankingLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { circl } from "../../providers";
import { bgprankingLookupInput } from "./input";
import { interpretBgprankingLookupReport } from "./interpret";

export const bgprankingLookup = defineCollectCap({
  id: "threat.bgpranking.lookup",
  version: "1",
  provider: circl,
  title: "CIRCL BGP Ranking",
  description:
    "Malicious-activity rank for an IP’s origin ASN (CIRCL). Useful when judging how noisy the whole ASN is.",
  dataSource: "bgpranking-ng.circl.lu",
  input: bgprankingLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: bgprankingLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* bgprankingLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`CIRCL BGP Ranking ${ip}`);
      const snap = yield* fetchBgprankingLookupEffect(ip, ctx.signal, {
        userAgent,
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
