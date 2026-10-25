import { Effect } from "effect";

import {
  fetchGreedybearLookupEffect,
  greedybearLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { greedybear } from "../../providers";
import { contact } from "../../sdk";
import { greedybearLookupInput } from "./input";
import { interpretGreedybearLookupReport } from "./interpret";

export const greedybearLookup = defineCollectCap({
  id: "threat.greedybear.lookup",
  provider: greedybear,
  title: "GreedyBear scanner feed",
  description:
    "Check whether an IP address or domain appears in GreedyBear's feed of scanners its honeypots saw in the last three days or so.",
  dataSource: "greedybear.honeynet.org",
  input: greedybearLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [
    contact.download(
      "https://greedybear.honeynet.org/api/feeds/all/scanner/recent.json"
    ),
  ],
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
