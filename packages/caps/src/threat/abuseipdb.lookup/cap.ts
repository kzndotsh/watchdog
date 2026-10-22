import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchAbuseIpdbCheckEffect,
  abuseIpdbLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { abuseIpdbLookupInput } from "./input";
import { interpretAbuseIpdbLookupReport } from "./interpret";

export const abuseIpdbLookup = defineCollectCap({
  id: "threat.abuseipdb.lookup",
  version: "1",
  title: "AbuseIPDB lookup",
  description:
    "Community abuse reports and confidence for an IP. Reputation signal only — not ownership or definitive malice.",
  dataSource: "api.abuseipdb.com",
  input: abuseIpdbLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "ABUSEIPDB_API_KEY" }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: abuseIpdbLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* abuseIpdbLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`AbuseIPDB ${ip}`);
      const key = yield* ctx.getCredential("ABUSEIPDB_API_KEY");
      const snap = yield* fetchAbuseIpdbCheckEffect(ip, key, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `confidence=${snap.abuseConfidenceScore ?? "n/a"} reports=${snap.totalReports ?? "n/a"}`
      );
      return {
        snap,
        artifactName: `abuseipdb-${ip.replaceAll(":", "-")}.json`,
      };
    }),
  interpretSnap: interpretAbuseIpdbLookupReport,
});
