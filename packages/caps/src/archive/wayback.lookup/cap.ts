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
    "List the dates the Wayback Machine captured a URL. Start here to learn whether a page existed at a given time.",
  dataSource: "web.archive.org/cdx",
  input: waybackLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  formOmit: ["entityId", "limit"],
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
      });
      ctx.log(
        `rows=${snap.rows.length} closest=${snap.closestTimestamp ?? "none"}`
      );
      return { snap, artifactName: "wayback-lookup.json" };
    }),
  interpretSnap: interpretWaybackLookupReport,
});
