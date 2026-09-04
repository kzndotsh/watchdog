import { Effect } from "effect";

import { fetchWaybackLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { waybackLookupInput } from "./input";
import { interpretWaybackLookupReport } from "./interpret";
import { waybackLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+archive.wayback.lookup; OSINT)";

export const waybackLookup = defineCollectCap({
  id: "archive.wayback.lookup",
  version: "1",
  title: "Wayback history",
  description:
    "List Wayback Machine snapshot timestamps for a URL — first pass for “was this page up then?” before fetching a body.",
  dataSource: "web.archive.org/cdx",
  input: waybackLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  formOmit: ["entityId", "limit"],
  consumes: [{ kind: "url" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: waybackLookupSnapshotSchema,
  reportLabel: "wayback.lookup",
  fetch: (ctx) =>
    Effect.gen(function* waybackLookupFetch() {
      const url = ctx.input.url.trim();
      ctx.log(`Wayback CDX ${url}`);
      const snap = yield* fetchWaybackLookupEffect(url, ctx.signal, {
        userAgent: UA,
        limit: ctx.input.limit ?? 25,
      });
      ctx.log(
        `rows=${snap.rows.length} closest=${snap.closestTimestamp ?? "none"}`
      );
      return { snap, artifactName: "wayback-lookup.json" };
    }),
  interpretSnap: interpretWaybackLookupReport,
});
