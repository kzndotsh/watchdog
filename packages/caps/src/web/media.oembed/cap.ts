import { Effect } from "effect";

import {
  ValidationVendorError,
  upstreamDiagnostic,
} from "@watchdog/tools/errors";
import { fetchOembedEffect, oembedSnapshotSchema } from "@watchdog/tools/http";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { oembedVendors } from "../../providers";
import { contact } from "../../sdk";
import { mediaOembedInput } from "./input";
import { interpretOembedReport } from "./interpret";

export const mediaOembed = defineCollectCap({
  id: "web.media.oembed",
  provider: oembedVendors,
  title: "Media oEmbed",
  description:
    "Get the public author name and link for a media URL from YouTube, Vimeo, Flickr, SoundCloud, TikTok or Spotify, without scraping the page.",
  dataSource: "vendor oEmbed endpoints",
  input: mediaOembedInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  contacts: [
    contact.provider("www.youtube.com"),
    contact.provider("vimeo.com"),
    contact.provider("www.flickr.com"),
    contact.provider("soundcloud.com"),
    contact.provider("www.tiktok.com"),
    contact.provider("open.spotify.com"),
  ],
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
