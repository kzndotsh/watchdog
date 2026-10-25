import { Effect } from "effect";

import {
  fetchCommoncrawlLookupEffect,
  commoncrawlLookupSnapshotSchema,
} from "@watchdog/tools/archive";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { commonCrawl } from "../../providers";
import { commoncrawlLookupInput } from "./input";
import { interpretCommoncrawlLookupReport } from "./interpret";

export const commoncrawlLookup = defineCollectCap({
  id: "archive.commoncrawl.lookup",
  provider: commonCrawl,
  title: "Common Crawl",
  description:
    "Search recent Common Crawl indexes for URLs on a domain. A different archive from the Wayback Machine, useful when it has little.",
  dataSource: "index.commoncrawl.org",
  input: commoncrawlLookupInput,
  timeoutMs: 120_000,
  kind: "collect",
  flags: ["slow"],
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: commoncrawlLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* commoncrawlLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Common Crawl ${host}`);
      const snap = yield* fetchCommoncrawlLookupEffect(host, ctx.signal, {
        userAgent,
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
