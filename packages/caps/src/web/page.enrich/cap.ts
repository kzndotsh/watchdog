import { Effect } from "effect";

import {
  ValidationVendorError,
  upstreamDiagnostic,
} from "@watchdog/tools/errors";
import {
  fetchPageEnrichEffect,
  pageEnrichSnapshotSchema,
} from "@watchdog/tools/http";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { targetHost } from "../../providers";
import { contact } from "../../sdk";
import { pageEnrichInput } from "./input";
import { interpretPageEnrichReport } from "./interpret";

export const pageEnrich = defineCollectCap({
  id: "web.page.enrich",
  provider: targetHost,
  contacts: [contact.target("http")],
  title: "Page enrich",
  description:
    "Fetch a page now and record its title, social and meta tags, and any common tracking scripts.",
  dataSource: "live HTML",
  input: pageEnrichInput,
  timeoutMs: 45_000,
  kind: "collect",
  flags: ["invasive"],
  useCases: ["Active"],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 15 * 60_000,
  },
  schema: pageEnrichSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* pageEnrichFetch() {
      const url = ctx.input.url;
      ctx.log(`page enrich ${url}`);
      const snap = yield* fetchPageEnrichEffect(url, ctx.signal, {
        userAgent,
      });
      if (!snap.ok) {
        return yield* new ValidationVendorError({
          message: "Page enrich failed",
          cause: upstreamDiagnostic(snap.error, snap.status),
        });
      }
      ctx.log(
        `title=${snap.title ?? "?"} trackers=${snap.trackers.map((t) => t.vendor).join(",") || "none"}`
      );
      return { snap, artifactName: "page-enrich.json" };
    }),
  interpretSnap: interpretPageEnrichReport,
});
