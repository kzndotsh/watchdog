import { Effect } from "effect";

import {
  emailosintLookupSnapshotSchema,
  fetchEmailosintLookupEffect,
} from "@watchdog/tools/breach";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { emailosint } from "../../providers";
import { contact } from "../../sdk";
import { emailosintLookupInput } from "./input";
import { interpretEmailosintLookupReport } from "./interpret";

export const emailosintLookup = defineCollectCap({
  id: "breach.emailosint.lookup",
  provider: emailosint,
  title: "EmailOSINT lookup",
  description:
    "Reverse-look up an email address on EmailOSINT: the services it is registered on (with any username, display name and profile link the vendor found), the breaches it appeared in (name and date only) and how many infostealer logs hold it (origin host only). No password, hash or login is stored, and the vendor's AI summary is turned off. The vendor warns results may be incomplete or mis-attributed, keeps every address searched and its results indefinitely, and shares the address with its own data providers.",
  dataSource: "api.emailosint.org",
  input: emailosintLookupInput,
  timeoutMs: 60_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("api.emailosint.org", { keyed: true })],
  credentials: [
    {
      slot: {
        name: "EMAILOSINT_API_KEY",
        label: "EmailOSINT",
        description:
          "EmailOSINT API key (eo_…, Business plan or higher) for breach.emailosint.lookup.",
      },
    },
  ],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "email" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: emailosintLookupSnapshotSchema,
  // The snapshot is an allowlist with no credential field, so the Export carries it as stored.
  exportRedaction: "unchanged",
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* emailosintLookupFetch() {
      ctx.log("EmailOSINT lookup");
      const key = yield* ctx.getCredential("EMAILOSINT_API_KEY");
      const snap = yield* fetchEmailosintLookupEffect(
        ctx.input.email,
        key,
        ctx.signal,
        { userAgent }
      );
      ctx.log(
        `accounts=${snap.accounts.length} registered=${snap.registeredOn.length} breaches=${snap.breachTotal ?? "?"} stealerLogs=${snap.stealerLogCount ?? "?"} completed=${snap.completed}`
      );
      return { snap, artifactName: "emailosint-lookup.json" };
    }),
  interpretSnap: interpretEmailosintLookupReport,
});
