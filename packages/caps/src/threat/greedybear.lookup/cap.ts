import { Effect } from "effect";

import { fetchGreedybearLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { greedybearLookupInput } from "./input";
import { interpretGreedybearLookupReport } from "./interpret";
import { greedybearLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.greedybear.lookup; OSINT)";

export const greedybearLookup = defineCollectCap({
  id: "threat.greedybear.lookup",
  version: "1",
  title: "GreedyBear scanner feed",
  description:
    "Whether an IP or domain appears in GreedyBear’s recent honeypot-scanner feed (last ~3 days of observed scanners).",
  dataSource: "greedybear.honeynet.org",
  input: greedybearLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: greedybearLookupSnapshotSchema,
  reportLabel: "greedybear.lookup",
  fetch: (ctx) =>
    Effect.gen(function* greedybearLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`GreedyBear ${query}`);
      const snap = yield* fetchGreedybearLookupEffect(query, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `greedybear-${safe}.json` };
    }),
  interpretSnap: interpretGreedybearLookupReport,
});
