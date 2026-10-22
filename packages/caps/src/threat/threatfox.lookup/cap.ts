import { Effect } from "effect";

import {
  fetchThreatfoxLookupEffect,
  threatfoxLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { abusech } from "../../providers";
import { threatfoxLookupInput } from "./input";
import { interpretThreatfoxLookupReport } from "./interpret";

export const threatfoxLookup = defineCollectCap({
  id: "threat.threatfox.lookup",
  version: "1",
  provider: abusech,
  title: "ThreatFox lookup",
  description:
    "Check ThreatFox for malware command servers and payloads tied to an IP address or domain.",
  dataSource: "threatfox-api.abuse.ch",
  input: threatfoxLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "THREATFOX_API_KEY" }],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: threatfoxLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* threatfoxLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`ThreatFox ${query}`);
      const key = yield* ctx.getCredential("THREATFOX_API_KEY");
      const snap = yield* fetchThreatfoxLookupEffect(query, key, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} iocs=${snap.iocs.length}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `threatfox-${safe}.json` };
    }),
  interpretSnap: interpretThreatfoxLookupReport,
});
