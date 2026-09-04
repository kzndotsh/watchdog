import { Effect } from "effect";

import { fetchEmailrepLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { emailrepLookupInput } from "./input";
import { interpretEmailrepLookupReport } from "./interpret";
import { emailrepLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+identity.emailrep.lookup; OSINT)";

export const emailrepLookup = defineCollectCap({
  id: "identity.emailrep.lookup",
  version: "1",
  title: "EmailRep lookup",
  description:
    "Aggregated reputation / suspiciousness signal for an email address (disposable, breach-adjacent, etc.). Context only — not proof of ownership.",
  dataSource: "emailrep.io",
  input: emailrepLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "EMAILREP_API_KEY" }],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "email" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: emailrepLookupSnapshotSchema,
  reportLabel: "emailrep.lookup",
  fetch: (ctx) =>
    Effect.gen(function* emailrepLookupFetch() {
      const email = ctx.input.email.trim();
      ctx.log(`EmailRep ${email}`);
      const key = yield* ctx.getCredential("EMAILREP_API_KEY");
      const snap = yield* fetchEmailrepLookupEffect(email, ctx.signal, {
        userAgent: UA,
        apiKey: key,
      });
      ctx.log(
        `found=${snap.found} reputation=${snap.reputation ?? "?"} suspicious=${snap.suspicious}`
      );
      return { snap, artifactName: "emailrep-lookup.json" };
    }),
  interpretSnap: interpretEmailrepLookupReport,
});
