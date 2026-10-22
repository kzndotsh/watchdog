import { Effect } from "effect";

import {
  fetchGreedybearLookupEffect,
  greedybearLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { greedybearLookupInput } from "./input";
import { interpretGreedybearLookupReport } from "./interpret";

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
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: greedybearLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* greedybearLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`GreedyBear ${query}`);
      const snap = yield* fetchGreedybearLookupEffect(query, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `greedybear-${safe}.json` };
    }),
  interpretSnap: interpretGreedybearLookupReport,
});
