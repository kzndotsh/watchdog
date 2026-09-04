import { Effect } from "effect";

import { fetchUrlhausLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { urlhausLookupInput } from "./input";
import { interpretUrlhausLookupReport } from "./interpret";
import { urlhausLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.urlhaus.lookup; OSINT)";

export const urlhausLookup = defineCollectCap({
  id: "threat.urlhaus.lookup",
  version: "1",
  title: "URLhaus lookup",
  description:
    "Whether a URL, host, or payload hash is listed as a malware distribution site / sample on URLhaus.",
  dataSource: "urlhaus-api.abuse.ch",
  input: urlhausLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "THREATFOX_API_KEY" }],
  consumes: [{ kind: "url" }, { kind: "host" }, { kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: urlhausLookupSnapshotSchema,
  reportLabel: "urlhaus.lookup",
  fetch: (ctx) =>
    Effect.gen(function* urlhausLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`URLhaus ${query}`);
      const key = yield* ctx.getCredential("THREATFOX_API_KEY");
      const snap = yield* fetchUrlhausLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} kind=${snap.kind}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `urlhaus-${safe}.json` };
    }),
  interpretSnap: interpretUrlhausLookupReport,
});
