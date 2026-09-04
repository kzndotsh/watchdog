import { Effect } from "effect";

import { submitWaybackSaveEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { archiveUrlSubmitInput } from "./input";
import { interpretArchiveUrlSubmitReport } from "./interpret";
import { archiveSubmitSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+archive.url.submit; OSINT)";

export const urlSubmit = defineCollectCap({
  id: "archive.url.submit",
  version: "1",
  title: "Submit to archives",
  description:
    "Request Wayback Save Page Now for a URL. Creates a public archive record attributable to this Case — use when you need a fresh snapshot on the public web.",
  dataSource: "web.archive.org/save",
  input: archiveUrlSubmitInput,
  timeoutMs: 90_000,
  kind: "act",
  flags: ["third_party", "invasive"],
  useCases: ["Active"],
  egress: "third_party",
  consumes: [{ kind: "url" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  schema: archiveSubmitSnapshotSchema,
  reportLabel: "archive.url.submit",
  fetch: (ctx) =>
    Effect.gen(function* urlSubmitFetch() {
      const url = ctx.input.url.trim();
      ctx.log(`archive submit (Wayback SPN) ${url}`);
      const snap = yield* submitWaybackSaveEffect(url, ctx.signal, {
        userAgent: UA,
      });
      const r = snap.results[0];
      ctx.log(
        `wayback accepted=${r?.accepted ?? false} status=${r?.status ?? "?"}`
      );
      return { snap, artifactName: "archive-submit.json" };
    }),
  interpretSnap: interpretArchiveUrlSubmitReport,
});
