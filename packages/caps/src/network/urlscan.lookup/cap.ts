import { Effect } from "effect";

import {
  fetchUrlscanSearchEffect,
  urlscanLookupSnapshotSchema,
} from "@watchdog/tools/network";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { urlscan } from "../../providers";
import { urlscanLookupInput } from "./input";
import { interpretUrlscanLookupReport } from "./interpret";

export const urlscanLookup = defineCollectCap({
  id: "network.urlscan.lookup",
  version: "1",
  provider: urlscan,
  title: "URLScan search",
  description:
    "Search urlscan.io's past public scans of a domain for snapshots of how its pages looked and behaved. Does not start a new scan.",
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* urlscanLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`URLScan search page.domain:${host}`);
      const snap = yield* fetchUrlscanSearchEffect(host, ctx.signal, {
        userAgent,
        size: 20,
      });
      ctx.log(`hits=${snap.hits.length} urls=${snap.urls.length}`);
      return { snap, artifactName: `urlscan-${host}.json` };
    }),
  interpretSnap: interpretUrlscanLookupReport,
});
