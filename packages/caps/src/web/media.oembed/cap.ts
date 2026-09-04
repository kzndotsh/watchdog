import { Effect } from "effect";

import { fetchOembedEffect, ValidationVendorError } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { mediaOembedInput } from "./input";
import { interpretOembedReport } from "./interpret";
import { oembedSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+web.media.oembed; OSINT)";

export const mediaOembed = defineCollectCap({
  id: "web.media.oembed",
  version: "1",
  title: "Media oEmbed",
  description:
    "Public oEmbed JSON for a media URL (YouTube, Vimeo, Flickr, SoundCloud, TikTok, Spotify) — author name/URL without scraping the page.",
  dataSource: "vendor oEmbed endpoints",
  input: mediaOembedInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["third_party"],
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
  reportLabel: "media.oembed",
  fetch: (ctx) =>
    Effect.gen(function* mediaOembedFetch() {
      const url = ctx.input.url.trim();
      ctx.log(`oEmbed ${url}`);
      const snap = yield* fetchOembedEffect(url, ctx.signal, { userAgent: UA });
      if (snap.error) {
        return yield* new ValidationVendorError({ message: snap.error });
      }
      ctx.log(
        `vendor=${snap.vendor ?? "?"} author=${snap.authorName ?? "?"} title=${snap.title ?? "?"}`
      );
      return { snap, artifactName: "oembed.json" };
    }),
  interpretSnap: interpretOembedReport,
});
