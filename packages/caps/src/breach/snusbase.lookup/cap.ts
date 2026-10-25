import { Effect } from "effect";

import {
  fetchSnusbaseLookupEffect,
  snusbaseLookupSnapshotSchema,
} from "@watchdog/tools/breach";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { snusbase } from "../../providers";
import { contact } from "../../sdk";
import { snusbaseLookupInput } from "./input";
import { interpretSnusbaseLookupReport } from "./interpret";

export const snusbaseLookup = defineCollectCap({
  id: "breach.snusbase.lookup",
  provider: snusbase,
  title: "Snusbase lookup",
  description:
    "Search Snusbase's breach and combolist data by email address, IP address, domain or username. A capped sample of records is kept as Evidence. In safe mode (WD_BREACH_CAPS=safe) Evidence never holds a password or password hash: each record keeps only whether one was present, its kind, its length and a keyed reuse fingerprint. In full mode the recovered passwords and hashes are kept in Evidence, and a Case Export redacts them to those attributes unless an owner or admin includes breach credentials.",
  dataSource: "api.snusbase.com",
  input: snusbaseLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  contacts: [contact.provider("api.snusbase.com", { keyed: true })],
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* snusbaseLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`Snusbase ${query}`);
      const key = yield* ctx.getCredential("SNUSBASE_API_KEY");
      const snap = yield* fetchSnusbaseLookupEffect(query, key, ctx.signal, {
        userAgent,
        credentials: {
          mode: ctx.breachCredentialMode,
          fingerprint: ctx.credentialFingerprint,
        },
      });
      ctx.log(`found=${snap.found} total=${snap.total}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `snusbase-${safe}.json` };
    }),
  interpretSnap: interpretSnusbaseLookupReport,
});
