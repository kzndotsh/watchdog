import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/cap-sdk";
import { fetchUnshortenEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { urlUnshortenInput } from "./input";
import { interpretUnshortenReport } from "./interpret";
import { unshortenSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+web.url.unshorten; OSINT)";

export const urlUnshorten = defineCollectCap({
  id: "web.url.unshorten",
  version: "1",
  title: "Unshorten URL",
  description:
    "Follow shortener redirect chains and record the hop path — reveals the final destination behind a short link.",
  dataSource: "HTTP redirects",
  input: urlUnshortenInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["invasive"],
  useCases: ["Active"],
  consumes: [{ kind: "url" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 10 * 60_000,
  },
  schema: unshortenSnapshotSchema,
  reportLabel: "url.unshorten",
  fetch: (ctx) =>
    Effect.gen(function* urlUnshortenFetch() {
      const url = ctx.input.url.trim();
      ctx.log(`unshorten ${url}`);
      const snap = yield* fetchUnshortenEffect(url, ctx.signal, {
        userAgent: UA,
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
