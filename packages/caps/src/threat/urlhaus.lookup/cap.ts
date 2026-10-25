import { Effect } from "effect";

import {
  fetchUrlhausLookupEffect,
  urlhausLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { abusech } from "../../providers";
import { contact } from "../../sdk";
import { urlhausLookupInput } from "./input";
import { interpretUrlhausLookupReport } from "./interpret";

export const urlhausLookup = defineCollectCap({
  id: "threat.urlhaus.lookup",
  provider: abusech,
  title: "URLhaus lookup",
  description:
    "Check whether URLhaus lists a URL, host or file hash as a malware distribution site or sample.",
  dataSource: "urlhaus-api.abuse.ch",
  input: urlhausLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("urlhaus-api.abuse.ch", { keyed: true })],
  credentials: [{ name: "THREATFOX_API_KEY" }],
  consumes: [{ kind: "url" }, { kind: "host" }, { kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "other" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: urlhausLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* urlhausLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`URLhaus ${query}`);
      const key = yield* ctx.getCredential("THREATFOX_API_KEY");
      const snap = yield* fetchUrlhausLookupEffect(query, key, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} kind=${snap.kind}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `urlhaus-${safe}.json` };
    }),
  interpretSnap: interpretUrlhausLookupReport,
});
