import { Effect } from "effect";

import {
  fetchEmailLookupEffect,
  emailLookupSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { systemResolver } from "../../providers";
import { emailLookupInput } from "./input";
import { interpretEmailLookupReport } from "./interpret";

export const emailLookup = defineCollectCap({
  id: "identity.email.lookup",
  provider: systemResolver,
  title: "Email lookup",
  description:
    "Check the mail setup of an email address's domain (MX, SPF and DMARC) and guess its mail provider. Lighter than a full mail config check.",
  dataSource: "system resolver",
  input: emailLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: emailLookupSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* emailLookupFetch() {
      const email = ctx.input.email;
      ctx.log(`email lookup ${email}`);
      const snap = yield* fetchEmailLookupEffect(email, ctx.signal);
      ctx.log(
        `domain=${snap.domain} provider=${snap.providerHint ?? "?"} MX=${snap.mx.length}`
      );
      return { snap, artifactName: `email-lookup.json` };
    }),
  interpretSnap: interpretEmailLookupReport,
});
