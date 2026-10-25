import { Effect } from "effect";

import {
  fetchVirusTotalLookupEffect,
  virusTotalLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { virustotal } from "../../providers";
import { virusTotalLookupInput } from "./input";
import { interpretVirusTotalLookupReport } from "./interpret";

export const virusTotalLookup = defineCollectCap({
  id: "threat.virustotal.lookup",
  provider: virustotal,
  title: "VirusTotal lookup",
  description:
    "Get VirusTotal's verdicts from many security vendors for an IP address or domain. A reputation signal, not proof of identity.",
  dataSource: "virustotal.com API v3",
  input: virusTotalLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "VIRUSTOTAL_API_KEY" }],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: virusTotalLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* virusTotalLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`VirusTotal ${query}`);
      const key = yield* ctx.getCredential("VIRUSTOTAL_API_KEY");
      const snap = yield* fetchVirusTotalLookupEffect(query, key, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `found=${snap.found} kind=${snap.kind} malicious=${snap.malicious ?? "n/a"}`
      );
      const safeName = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `virustotal-${safeName}.json` };
    }),
  interpretSnap: interpretVirusTotalLookupReport,
});
