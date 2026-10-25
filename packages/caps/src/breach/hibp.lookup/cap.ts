import { Effect } from "effect";

import {
  fetchHibpBreachedAccountEffect,
  hibpLookupSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { hibp } from "../../providers";
import { contact } from "../../sdk";
import { hibpLookupInput } from "./input";
import { interpretHibpLookupReport } from "./interpret";

export const hibpLookup = defineCollectCap({
  id: "breach.hibp.lookup",
  provider: hibp,
  title: "HIBP lookup",
  description:
    "Check Have I Been Pwned for the breaches an email address appeared in. A hit means the address was in a breach, not that the same person controls it today.",
  dataSource: "haveibeenpwned.com",
  input: hibpLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  contacts: [contact.provider("haveibeenpwned.com", { keyed: true })],
  credentials: [{ name: "HIBP_API_KEY" }],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "email" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: hibpLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* hibpLookupFetch() {
      const email = ctx.input.email;
      ctx.log(`HIBP ${email}`);
      const key = yield* ctx.getCredential("HIBP_API_KEY");
      const snap = yield* fetchHibpBreachedAccountEffect(
        email,
        key,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`found=${snap.found} breaches=${snap.breachCount}`);
      return { snap, artifactName: "hibp-lookup.json" };
    }),
  interpretSnap: interpretHibpLookupReport,
});
