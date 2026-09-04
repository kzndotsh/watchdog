import { Effect } from "effect";

import { fetchSafebrowsingLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { safebrowsingLookupInput } from "./input";
import { interpretSafebrowsingLookupReport } from "./interpret";
import { safebrowsingLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.safebrowsing.lookup; OSINT)";

export const safebrowsingLookup = defineCollectCap({
  id: "threat.safebrowsing.lookup",
  version: "1",
  title: "Google Safe Browsing lookup",
  description:
    "Whether a URL hits Google’s malware / social-engineering / unwanted-software lists.",
  dataSource: "safebrowsing.googleapis.com",
  input: safebrowsingLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "GOOGLE_SAFEBROWSING_API_KEY" }],
  consumes: [{ kind: "url" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: safebrowsingLookupSnapshotSchema,
  reportLabel: "safebrowsing.lookup",
  fetch: (ctx) =>
    Effect.gen(function* safebrowsingLookupFetch() {
      const url = ctx.input.url.trim();
      ctx.log(`Safe Browsing ${url}`);
      const key = yield* ctx.getCredential("GOOGLE_SAFEBROWSING_API_KEY");
      const snap = yield* fetchSafebrowsingLookupEffect(url, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} matches=${snap.matches.length}`);
      const safe = url.replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      return { snap, artifactName: `safebrowsing-${safe}.json` };
    }),
  interpretSnap: interpretSafebrowsingLookupReport,
});
