import { Effect } from "effect";

import {
  submitUrlscanEffect,
  urlscanSubmitSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { urlscan } from "../../providers";
import { contact } from "../../sdk";
import { urlscanSubmitInput } from "./input";
import { interpretUrlscanSubmitReport } from "./interpret";

export const urlscanSubmit = defineCollectCap({
  id: "network.urlscan.submit",
  provider: urlscan,
  title: "URLScan submit",
  description:
    "Ask urlscan.io to load a URL in a browser now and record what it does. Scans are unlisted by default, because a public scan can reveal what you are investigating.",
  dataSource: "urlscan.io/api/v1/scan",
  input: urlscanSubmitInput,
  timeoutMs: 30_000,
  kind: "act",
  flags: ["invasive"],
  useCases: ["Active"],
  contacts: [contact.provider("urlscan.io", { keyed: true })],
  credentials: [{ name: "URLSCAN_API_KEY" }],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  schema: urlscanSubmitSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* urlscanSubmitFetch() {
      const url = ctx.input.url;
      const visibility = ctx.input.visibility ?? "unlisted";
      ctx.log(`urlscan.io submit ${url} visibility=${visibility}`);
      const key = yield* ctx.getCredential("URLSCAN_API_KEY");
      const snap = yield* submitUrlscanEffect(
        url,
        key,
        visibility,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`accepted=${snap.accepted} uuid=${snap.uuid ?? "none"}`);
      return { snap, artifactName: "urlscan-submit.json" };
    }),
  interpretSnap: interpretUrlscanSubmitReport,
});
