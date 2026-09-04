import { Effect } from "effect";

import { fetchDehashedLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { dehashedLookupInput } from "./input";
import { interpretDehashedLookupReport } from "./interpret";
import { dehashedLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+breach.dehashed.lookup; OSINT)";

export const dehashedLookup = defineCollectCap({
  id: "breach.dehashed.lookup",
  version: "1",
  title: "DeHashed lookup",
  description:
    "Paid breach-corpus search for an email, IP, domain, username, or freeform query. Evidence stores recovered emails, usernames, passwords, and hashes (capped sample); Claim summarizes a short sample for Accept.",
  dataSource: "api.dehashed.com",
  input: dehashedLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive"],
  egress: "third_party",
  credentials: [{ name: "DEHASHED_API_KEY" }],
  consumes: [
    { kind: "ip" },
    { kind: "host" },
    { kind: "identifier", type: "email" },
  ],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: dehashedLookupSnapshotSchema,
  reportLabel: "dehashed.lookup",
  fetch: (ctx) =>
    Effect.gen(function* dehashedLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`DeHashed ${query}`);
      const key = yield* ctx.getCredential("DEHASHED_API_KEY");
      const snap = yield* fetchDehashedLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} total=${snap.total}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `dehashed-${safe}.json` };
    }),
  interpretSnap: interpretDehashedLookupReport,
});
