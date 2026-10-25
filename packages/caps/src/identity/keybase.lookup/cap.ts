import { Effect } from "effect";

import {
  fetchKeybaseLookupEffect,
  keybaseLookupSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { keybase } from "../../providers";
import { keybaseLookupInput } from "./input";
import { interpretKeybaseLookupReport } from "./interpret";

export const keybaseLookup = defineCollectCap({
  id: "identity.keybase.lookup",
  provider: keybase,
  title: "Keybase lookup",
  description:
    "Look up a Keybase user or domain to see the accounts and keys they have proven they control.",
  dataSource: "keybase.io/_/api/1.0/user/lookup",
  input: keybaseLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "identifier", type: "handle" }, { kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "handle" },
    { kind: "identifier", type: "url" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "pgp" },
    { kind: "identifier", type: "crypto" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: keybaseLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* keybaseLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`Keybase ${query}`);
      const snap = yield* fetchKeybaseLookupEffect(query, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `found=${snap.found} user=${snap.username ?? "?"} proofs=${snap.proofs.length}`
      );
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `keybase-${safe}.json` };
    }),
  interpretSnap: interpretKeybaseLookupReport,
});
