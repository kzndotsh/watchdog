import { Effect } from "effect";

import { fetchKeybaseLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { keybaseLookupInput } from "./input";
import { interpretKeybaseLookupReport } from "./interpret";
import { keybaseLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+identity.keybase.lookup; OSINT)";

export const keybaseLookup = defineCollectCap({
  id: "identity.keybase.lookup",
  version: "1",
  title: "Keybase lookup",
  description:
    "Keybase username or domain-proof lookup — cross-platform proofs and PGP/crypto tips for identity graphing.",
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
  reportLabel: "keybase.lookup",
  fetch: (ctx) =>
    Effect.gen(function* keybaseLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`Keybase ${query}`);
      const snap = yield* fetchKeybaseLookupEffect(query, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `found=${snap.found} user=${snap.username ?? "?"} proofs=${snap.proofs.length}`
      );
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `keybase-${safe}.json` };
    }),
  interpretSnap: interpretKeybaseLookupReport,
});
