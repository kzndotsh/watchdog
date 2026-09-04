import { Effect } from "effect";

import { fetchPgpLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { pgpLookupInput } from "./input";
import { interpretPgpLookupReport } from "./interpret";
import { pgpLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+identity.pgp.lookup; OSINT)";

export const pgpLookup = defineCollectCap({
  id: "identity.pgp.lookup",
  version: "1",
  title: "PGP lookup",
  description:
    "HKP keyserver search by email, fingerprint, or key id. Useful for linking mailboxes to published keys.",
  dataSource: "keys.openpgp.org / keyserver.ubuntu.com",
  input: pgpLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  flags: ["third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "pgp" },
  ],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: pgpLookupSnapshotSchema,
  reportLabel: "pgp.lookup",
  fetch: (ctx) =>
    Effect.gen(function* pgpLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`PGP lookup ${query}`);
      const snap = yield* fetchPgpLookupEffect(query, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`keys=${snap.keys.length} source=${snap.source ?? "none"}`);
      return { snap, artifactName: "pgp-lookup.json" };
    }),
  interpretSnap: interpretPgpLookupReport,
});
