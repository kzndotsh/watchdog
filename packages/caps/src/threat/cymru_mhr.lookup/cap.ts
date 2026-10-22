import { Effect } from "effect";

import {
  fetchCymruMhrLookupEffect,
  cymruMhrLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { teamCymru } from "../../providers";
import { cymruMhrLookupInput } from "./input";
import { interpretCymruMhrLookupReport } from "./interpret";

export const cymruMhrLookup = defineCollectCap({
  id: "threat.cymru_mhr.lookup",
  version: "1",
  provider: teamCymru,
  title: "Team Cymru Malware Hash Registry",
  description:
    "Malware Hash Registry: last-seen time and AV detection % for a file hash. Complements VirusTotal with a DNS-native check.",
  dataSource: "hash.cymru.com (DNS)",
  input: cymruMhrLookupInput,
  timeoutMs: 15_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "hash" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "other" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: cymruMhrLookupSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* cymruMhrLookupFetch() {
      const hash = ctx.input.hash;
      ctx.log(`Team Cymru MHR ${hash}`);
      const snap = yield* fetchCymruMhrLookupEffect(hash, ctx.signal);
      ctx.log(`found=${snap.found} detectionPct=${snap.detectionPct ?? "n/a"}`);
      return { snap, artifactName: `cymru-mhr-${snap.hash}.json` };
    }),
  interpretSnap: interpretCymruMhrLookupReport,
});
