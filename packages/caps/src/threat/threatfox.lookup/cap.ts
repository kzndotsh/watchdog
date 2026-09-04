import { Effect } from "effect";

import { fetchThreatfoxLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { threatfoxLookupInput } from "./input";
import { interpretThreatfoxLookupReport } from "./interpret";
import { threatfoxLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.threatfox.lookup; OSINT)";

export const threatfoxLookup = defineCollectCap({
  id: "threat.threatfox.lookup",
  version: "1",
  title: "ThreatFox lookup",
  description:
    "Malware C2 and payload IOC search for an IP or domain. Distinct from AbuseIPDB IP reputation.",
  dataSource: "threatfox-api.abuse.ch",
  input: threatfoxLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "THREATFOX_API_KEY" }],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: threatfoxLookupSnapshotSchema,
  reportLabel: "threatfox.lookup",
  fetch: (ctx) =>
    Effect.gen(function* threatfoxLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`ThreatFox ${query}`);
      const key = yield* ctx.getCredential("THREATFOX_API_KEY");
      const snap = yield* fetchThreatfoxLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} iocs=${snap.iocs.length}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `threatfox-${safe}.json` };
    }),
  interpretSnap: interpretThreatfoxLookupReport,
});
