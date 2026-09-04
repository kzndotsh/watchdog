import { Effect } from "effect";

import { fetchUrlscanSearchEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { urlscanLookupInput } from "./input";
import { interpretUrlscanLookupReport } from "./interpret";
import { urlscanLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.urlscan.lookup; OSINT)";

export const urlscanLookup = defineCollectCap({
  id: "network.urlscan.lookup",
  version: "1",
  title: "URLScan search",
  description:
    "Search past public urlscan.io scans for a domain — not a live submit. Good for historical page/DOM fingerprints.",
  dataSource: "urlscan.io/api/v1/search",
  input: urlscanLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: urlscanLookupSnapshotSchema,
  reportLabel: "urlscan.lookup",
  fetch: (ctx) =>
    Effect.gen(function* urlscanLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`URLScan search page.domain:${host}`);
      const snap = yield* fetchUrlscanSearchEffect(host, ctx.signal, {
        userAgent: UA,
        size: 20,
      });
      ctx.log(`hits=${snap.hits.length} urls=${snap.urls.length}`);
      return { snap, artifactName: `urlscan-${host}.json` };
    }),
  interpretSnap: interpretUrlscanLookupReport,
});
