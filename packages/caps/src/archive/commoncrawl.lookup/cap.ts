import { Effect } from "effect";

import { fetchCommoncrawlLookupEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { commoncrawlLookupInput } from "./input";
import { interpretCommoncrawlLookupReport } from "./interpret";
import { commoncrawlLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+archive.commoncrawl.lookup; OSINT)";

export const commoncrawlLookup = defineCollectCap({
  id: "archive.commoncrawl.lookup",
  version: "1",
  title: "Common Crawl",
  description:
    "Search recent Common Crawl indexes for URLs under a domain — different corpus than Wayback; useful when archive.org is thin.",
  dataSource: "index.commoncrawl.org",
  input: commoncrawlLookupInput,
  timeoutMs: 120_000,
  kind: "collect",
  flags: ["slow"],
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: commoncrawlLookupSnapshotSchema,
  reportLabel: "commoncrawl.lookup",
  fetch: (ctx) =>
    Effect.gen(function* commoncrawlLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Common Crawl ${host}`);
      const snap = yield* fetchCommoncrawlLookupEffect(host, ctx.signal, {
        userAgent: UA,
        indexes: 2,
        limit: 40,
      });
      ctx.log(
        `indexes=${snap.indexes.join(",")} urls=${snap.urls.length} hits=${snap.hits.length}`
      );
      return { snap, artifactName: `commoncrawl-${host}.json` };
    }),
  interpretSnap: interpretCommoncrawlLookupReport,
});
