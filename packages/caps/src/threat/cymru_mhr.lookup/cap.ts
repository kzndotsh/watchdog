import { Effect } from "effect";

import {
  fetchCymruMhrLookupEffect,
  cymruMhrLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { teamCymru } from "../../providers";
import { contact } from "../../sdk";
import { cymruMhrLookupInput } from "./input";
import { interpretCymruMhrLookupReport } from "./interpret";

export const cymruMhrLookup = defineCollectCap({
  id: "threat.cymru_mhr.lookup",
  provider: teamCymru,
  title: "Team Cymru Malware Hash Registry",
  description:
    "Check Team Cymru's Malware Hash Registry for a file hash: when it was last seen and what share of antivirus engines detect it.",
  dataSource: "hash.cymru.com (DNS)",
  input: cymruMhrLookupInput,
  timeoutMs: 15_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.dnsZone("hash.cymru.com")],
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
