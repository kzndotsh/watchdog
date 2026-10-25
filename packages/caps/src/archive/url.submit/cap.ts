import { Effect } from "effect";

import {
  submitWaybackSaveEffect,
  archiveSubmitSnapshotSchema,
} from "@watchdog/tools/wayback";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { internetArchive } from "../../providers";
import { contact } from "../../sdk";
import { archiveUrlSubmitInput } from "./input";
import { interpretArchiveUrlSubmitReport } from "./interpret";

export const urlSubmit = defineCollectCap({
  id: "archive.url.submit",
  provider: internetArchive,
  title: "Submit to archives",
  description:
    "Ask the Wayback Machine to capture a URL now. This creates a public record of the capture, so use it only when you need a fresh public snapshot.",
  dataSource: "web.archive.org/save",
  input: archiveUrlSubmitInput,
  timeoutMs: 90_000,
  kind: "act",
  flags: ["invasive"],
  useCases: ["Active"],
  contacts: [contact.provider("web.archive.org")],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  schema: archiveSubmitSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* urlSubmitFetch() {
      const url = ctx.input.url;
      ctx.log(`archive submit (Wayback SPN) ${url}`);
      const snap = yield* submitWaybackSaveEffect(url, ctx.signal, {
        userAgent,
      });
      const r = snap.results[0];
      ctx.log(
        `wayback accepted=${r?.accepted ?? false} status=${r?.status ?? "?"}`
      );
      return { snap, artifactName: "archive-submit.json" };
    }),
  interpretSnap: interpretArchiveUrlSubmitReport,
});
