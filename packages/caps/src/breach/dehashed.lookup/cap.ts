import { Effect } from "effect";

import {
  fetchDehashedLookupEffect,
  dehashedLookupSnapshotSchema,
} from "@watchdog/tools/breach";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { dehashed } from "../../providers";
import { contact } from "../../sdk";
import { dehashedLookupInput } from "./input";
import { interpretDehashedLookupReport } from "./interpret";

export const dehashedLookup = defineCollectCap({
  id: "breach.dehashed.lookup",
  provider: dehashed,
  title: "DeHashed lookup",
  description:
    "Search DeHashed's breach data by email address, IP address, domain, username or free text. A capped sample of records is kept as Evidence. In safe mode (WD_BREACH_CAPS=safe) Evidence never holds a password or password hash: each record keeps only whether one was present, its kind, its length and a keyed reuse fingerprint. In full mode the recovered passwords and hashes are kept in Evidence, and a Case Export redacts them to those attributes unless an owner or admin includes breach credentials.",
  dataSource: "api.dehashed.com",
  input: dehashedLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  contacts: [contact.provider("api.dehashed.com", { keyed: true })],
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* dehashedLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`DeHashed ${query}`);
      const key = yield* ctx.getCredential("DEHASHED_API_KEY");
      const snap = yield* fetchDehashedLookupEffect(query, key, ctx.signal, {
        userAgent,
        credentials: {
          mode: ctx.breachCredentialMode,
          fingerprint: ctx.credentialFingerprint,
        },
      });
      ctx.log(`found=${snap.found} total=${snap.total}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `dehashed-${safe}.json` };
    }),
  interpretSnap: interpretDehashedLookupReport,
});
