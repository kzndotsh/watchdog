import { Effect } from "effect";

import {
  fetchEmailrepLookupEffect,
  emailrepLookupSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { emailrep } from "../../providers";
import { emailrepLookupInput } from "./input";
import { interpretEmailrepLookupReport } from "./interpret";

export const emailrepLookup = defineCollectCap({
  id: "identity.emailrep.lookup",
  version: "1",
  provider: emailrep,
  title: "EmailRep lookup",
  description:
    "Get a reputation score for an email address, such as whether it is disposable or has appeared near breaches. Context only, not proof of who owns it.",
  dataSource: "emailrep.io",
  input: emailrepLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* emailrepLookupFetch() {
      const email = ctx.input.email;
      ctx.log(`EmailRep ${email}`);
      const key = yield* ctx.getCredential("EMAILREP_API_KEY");
      const snap = yield* fetchEmailrepLookupEffect(email, ctx.signal, {
        userAgent,
        apiKey: key,
      });
      ctx.log(
        `found=${snap.found} reputation=${snap.reputation ?? "?"} suspicious=${snap.suspicious}`
      );
      return { snap, artifactName: "emailrep-lookup.json" };
    }),
  interpretSnap: interpretEmailrepLookupReport,
});
