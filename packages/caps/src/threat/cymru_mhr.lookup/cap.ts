import { Effect } from "effect";

import { fetchCymruMhrLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { cymruMhrLookupInput } from "./input";
import { interpretCymruMhrLookupReport } from "./interpret";
import { cymruMhrLookupSnapshotSchema } from "./report-schema";

export const cymruMhrLookup = defineCollectCap({
  id: "threat.cymru_mhr.lookup",
  version: "1",
  title: "Team Cymru Malware Hash Registry",
  description:
    "Malware Hash Registry: last-seen time and AV detection % for a file hash. Complements VirusTotal with a DNS-native check.",
  dataSource: "hash.cymru.com (DNS)",
  input: cymruMhrLookupInput,
  timeoutMs: 15_000,
  kind: "collect",
  flags: ["third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "hash" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: cymruMhrLookupSnapshotSchema,
  reportLabel: "cymru_mhr.lookup",
  fetch: (ctx) =>
    Effect.gen(function* cymruMhrLookupFetch() {
      const hash = ctx.input.hash.trim();
      ctx.log(`Team Cymru MHR ${hash}`);
      const snap = yield* fetchCymruMhrLookupEffect(hash, ctx.signal);
      ctx.log(`found=${snap.found} detectionPct=${snap.detectionPct ?? "n/a"}`);
      return { snap, artifactName: `cymru-mhr-${snap.hash}.json` };
    }),
  interpretSnap: interpretCymruMhrLookupReport,
});
