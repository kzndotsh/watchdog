import { Effect } from "effect";

import {
  fetchHudsonrockLookupEffect,
  hudsonrockLookupSnapshotSchema,
} from "@watchdog/tools/breach";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { hudsonRock } from "../../providers";
import { hudsonrockLookupInput } from "./input";
import { interpretHudsonrockLookupReport } from "./interpret";

export const hudsonrockLookup = defineCollectCap({
  id: "breach.hudsonrock.lookup",
  provider: hudsonRock,
  title: "Hudson Rock lookup",
  description:
    "Check Hudson Rock for infostealer infections tied to an email address, IP address or domain: how many and the most recent date. No passwords or cookies are returned.",
  dataSource: "api.hudsonrock.com",
  input: hudsonrockLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  egress: "third_party",
  credentials: [{ name: "HUDSONROCK_API_KEY" }],
  consumes: [
    { kind: "ip" },
    { kind: "host" },
    { kind: "identifier", type: "email" },
  ],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "email" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: hudsonrockLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* hudsonrockLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`Hudson Rock ${query}`);
      const key = yield* ctx.getCredential("HUDSONROCK_API_KEY");
      const snap = yield* fetchHudsonrockLookupEffect(query, key, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} totalResults=${snap.totalResults}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `hudsonrock-${safe}.json` };
    }),
  interpretSnap: interpretHudsonrockLookupReport,
});
