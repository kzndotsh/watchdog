import { Effect } from "effect";

import {
  ValidationVendorError,
  upstreamDiagnostic,
} from "@watchdog/tools/errors";
import { fetchOembedEffect, oembedSnapshotSchema } from "@watchdog/tools/http";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { oembedVendors } from "../../providers";
import { mediaOembedInput } from "./input";
import { interpretOembedReport } from "./interpret";

export const mediaOembed = defineCollectCap({
  id: "web.media.oembed",
  version: "1",
  provider: oembedVendors,
  title: "Media oEmbed",
  description:
    "Public oEmbed JSON for a media URL (YouTube, Vimeo, Flickr, SoundCloud, TikTok, Spotify) — author name/URL without scraping the page.",
  dataSource: "vendor oEmbed endpoints",
  input: mediaOembedInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  egress: "third_party",
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "handle" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: oembedSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* mediaOembedFetch() {
      const url = ctx.input.url;
      ctx.log(`oEmbed ${url}`);
      const snap = yield* fetchOembedEffect(url, ctx.signal, { userAgent });
      if (snap.error) {
        return yield* new ValidationVendorError({
          message: "oEmbed lookup failed",
          cause: upstreamDiagnostic(snap.error),
        });
      }
      ctx.log(
        `vendor=${snap.vendor ?? "?"} author=${snap.authorName ?? "?"} title=${snap.title ?? "?"}`
      );
      return { snap, artifactName: "oembed.json" };
    }),
  interpretSnap: interpretOembedReport,
});
