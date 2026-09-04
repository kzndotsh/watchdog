import { Effect } from "effect";

import { fetchVirusTotalLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { virusTotalLookupInput } from "./input";
import { interpretVirusTotalLookupReport } from "./interpret";
import { virusTotalLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.virustotal.lookup; OSINT)";

export const virusTotalLookup = defineCollectCap({
  id: "threat.virustotal.lookup",
  version: "1",
  title: "VirusTotal lookup",
  description:
    "Multi-engine reputation for an IP or domain. Aggregation signal — not identity proof.",
  dataSource: "virustotal.com API v3",
  input: virusTotalLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "VIRUSTOTAL_API_KEY" }],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: virusTotalLookupSnapshotSchema,
  reportLabel: "virustotal.lookup",
  fetch: (ctx) =>
    Effect.gen(function* virusTotalLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`VirusTotal ${query}`);
      const key = yield* ctx.getCredential("VIRUSTOTAL_API_KEY");
      const snap = yield* fetchVirusTotalLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `found=${snap.found} kind=${snap.kind} malicious=${snap.malicious ?? "n/a"}`
      );
      const safeName = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `virustotal-${safeName}.json` };
    }),
  interpretSnap: interpretVirusTotalLookupReport,
});
