import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/schemas/shared";
import {
  fetchUnshortenEffect,
  unshortenSnapshotSchema,
} from "@watchdog/tools/http";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { targetHost } from "../../providers";
import { contact } from "../../sdk";
import { urlUnshortenInput } from "./input";
import { interpretUnshortenReport } from "./interpret";

export const urlUnshorten = defineCollectCap({
  id: "web.url.unshorten",
  provider: targetHost,
  contacts: [contact.target("http")],
  title: "Unshorten URL",
  description:
    "Follow a short link's redirects and record every hop, ending at the real destination.",
  dataSource: "HTTP redirects",
  input: urlUnshortenInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["invasive"],
  useCases: ["Active"],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 10 * 60_000,
  },
  schema: unshortenSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* urlUnshortenFetch() {
      const url = ctx.input.url;
      ctx.log(`unshorten ${url}`);
      const snap = yield* fetchUnshortenEffect(url, ctx.signal, {
        userAgent,
      });
      ctx.log(`final=${snap.finalUrl} hops=${snap.hopCount}`);
      return { snap, artifactName: "unshorten.json" };
    }),
  interpretSnap: interpretUnshortenReport,
  handoff(report): JobHandoff | undefined {
    const parsed = unshortenSnapshotSchema.safeParse(report);
    let bags: JobHandoff | undefined;
    if (parsed.success) {
      const url = parsed.data.finalUrl.trim();
      if (url !== "") bags = { url: [url] };
    }
    return bags;
  },
});
