import { Effect } from "effect";

import { fetchHibpBreachedAccountEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { hibpLookupInput } from "./input";
import { interpretHibpLookupReport } from "./interpret";
import { hibpLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+breach.hibp.lookup; OSINT)";

export const hibpLookup = defineCollectCap({
  id: "breach.hibp.lookup",
  version: "1",
  title: "HIBP lookup",
  description:
    "Have I Been Pwned breached-account metadata for an email. A hit means the address appeared in a breach dump — not proof of who controls it today.",
  dataSource: "haveibeenpwned.com",
  input: hibpLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive"],
  egress: "third_party",
  credentials: [{ name: "HIBP_API_KEY" }],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: hibpLookupSnapshotSchema,
  reportLabel: "hibp.lookup",
  fetch: (ctx) =>
    Effect.gen(function* hibpLookupFetch() {
      const email = ctx.input.email.trim();
      ctx.log(`HIBP ${email}`);
      const key = yield* ctx.getCredential("HIBP_API_KEY");
      const snap = yield* fetchHibpBreachedAccountEffect(
        email,
        key,
        ctx.signal,
        { userAgent: UA }
      );
      ctx.log(`found=${snap.found} breaches=${snap.breachCount}`);
      return { snap, artifactName: "hibp-lookup.json" };
    }),
  interpretSnap: interpretHibpLookupReport,
});
