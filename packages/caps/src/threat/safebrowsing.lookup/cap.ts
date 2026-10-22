import { Effect } from "effect";

import {
  fetchSafebrowsingLookupEffect,
  safebrowsingLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { googleSafeBrowsing } from "../../providers";
import { safebrowsingLookupInput } from "./input";
import { interpretSafebrowsingLookupReport } from "./interpret";

export const safebrowsingLookup = defineCollectCap({
  id: "threat.safebrowsing.lookup",
  version: "1",
  provider: googleSafeBrowsing,
  title: "Google Safe Browsing lookup",
  description:
    "Check whether Google Safe Browsing lists a URL as malware, phishing or unwanted software.",
  dataSource: "safebrowsing.googleapis.com",
  input: safebrowsingLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "GOOGLE_SAFEBROWSING_API_KEY" }],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: safebrowsingLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* safebrowsingLookupFetch() {
      const url = ctx.input.url;
      ctx.log(`Safe Browsing ${url}`);
      const key = yield* ctx.getCredential("GOOGLE_SAFEBROWSING_API_KEY");
      const snap = yield* fetchSafebrowsingLookupEffect(url, key, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} matches=${snap.matches.length}`);
      const safe = url.replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      return { snap, artifactName: `safebrowsing-${safe}.json` };
    }),
  interpretSnap: interpretSafebrowsingLookupReport,
});
