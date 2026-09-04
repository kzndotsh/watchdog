import { Effect } from "effect";

import { fetchHudsonrockLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { hudsonrockLookupInput } from "./input";
import { interpretHudsonrockLookupReport } from "./interpret";
import { hudsonrockLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+breach.hudsonrock.lookup; OSINT)";

export const hudsonrockLookup = defineCollectCap({
  id: "breach.hudsonrock.lookup",
  version: "1",
  title: "Hudson Rock lookup",
  description:
    "Infostealer exposure for an email, IP, or domain: hit counts and newest compromise date. Does not return plaintext passwords or cookies.",
  dataSource: "api.hudsonrock.com",
  input: hudsonrockLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive"],
  egress: "third_party",
  credentials: [{ name: "HUDSONROCK_API_KEY" }],
  consumes: [
    { kind: "ip" },
    { kind: "host" },
    { kind: "identifier", type: "email" },
  ],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: hudsonrockLookupSnapshotSchema,
  reportLabel: "hudsonrock.lookup",
  fetch: (ctx) =>
    Effect.gen(function* hudsonrockLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`Hudson Rock ${query}`);
      const key = yield* ctx.getCredential("HUDSONROCK_API_KEY");
      const snap = yield* fetchHudsonrockLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} totalResults=${snap.totalResults}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `hudsonrock-${safe}.json` };
    }),
  interpretSnap: interpretHudsonrockLookupReport,
});
