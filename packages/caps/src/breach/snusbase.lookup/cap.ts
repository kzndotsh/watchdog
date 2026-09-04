import { Effect } from "effect";

import { fetchSnusbaseLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { snusbaseLookupInput } from "./input";
import { interpretSnusbaseLookupReport } from "./interpret";
import { snusbaseLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+breach.snusbase.lookup; OSINT)";

export const snusbaseLookup = defineCollectCap({
  id: "breach.snusbase.lookup",
  version: "1",
  title: "Snusbase lookup",
  description:
    "Paid breach/combolist corpus search for an email, IP, domain, or username (Snusbase). Evidence stores recovered emails, usernames, passwords, and hashes (capped sample); Claim summarizes a short sample for Accept.",
  dataSource: "api.snusbase.com",
  input: snusbaseLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive"],
  egress: "third_party",
  credentials: [{ name: "SNUSBASE_API_KEY" }],
  consumes: [
    { kind: "ip" },
    { kind: "host" },
    { kind: "identifier", type: "email" },
  ],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: snusbaseLookupSnapshotSchema,
  reportLabel: "snusbase.lookup",
  fetch: (ctx) =>
    Effect.gen(function* snusbaseLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`Snusbase ${query}`);
      const key = yield* ctx.getCredential("SNUSBASE_API_KEY");
      const snap = yield* fetchSnusbaseLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} total=${snap.total}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `snusbase-${safe}.json` };
    }),
  interpretSnap: interpretSnusbaseLookupReport,
});
