import { Effect } from "effect";

import {
  fetchWaybackLookupEffect,
  waybackLookupSnapshotSchema,
} from "@watchdog/tools/wayback";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { internetArchive } from "../../providers";
import { contact } from "../../sdk";
import { waybackLookupInput } from "./input";
import { interpretWaybackLookupReport } from "./interpret";

export const waybackLookup = defineCollectCap({
  id: "archive.wayback.lookup",
  provider: internetArchive,
  contacts: [contact.provider("web.archive.org")],
  title: "Wayback history",
  description:
    "List when the Wayback Machine captured a URL, by default only the captures where the page changed. Start here to learn whether a page existed at a given time and how often it changed.",
  dataSource: "web.archive.org/cdx",
  input: waybackLookupInput,
  timeoutMs: 90_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  formOmit: ["entityId", "limit", "resumeKey"],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: waybackLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* waybackLookupFetch() {
      const url = ctx.input.url;
      ctx.log(`Wayback CDX ${url}`);
      const snap = yield* fetchWaybackLookupEffect(url, ctx.signal, {
        userAgent,
        limit: ctx.input.limit ?? 25,
        distinctOnly: ctx.input.distinctOnly,
        statusFilter: ctx.input.allStatuses === true ? "any" : "ok",
        ...(ctx.input.after === undefined ? {} : { after: ctx.input.after }),
        ...(ctx.input.before === undefined ? {} : { before: ctx.input.before }),
        ...(ctx.input.resumeKey === undefined
          ? {}
          : { resumeKey: ctx.input.resumeKey }),
      });
      ctx.log(
        `rows=${snap.rows.length} versions=${snap.distinctVersions} captures=${snap.totalCaptures ?? "unknown"} truncated=${snap.isTruncated}`
      );
      return { snap, artifactName: "wayback-lookup.json" };
    }),
  interpretSnap: interpretWaybackLookupReport,
});
