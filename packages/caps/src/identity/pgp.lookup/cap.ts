import { Effect } from "effect";

import {
  fetchPgpLookupEffect,
  pgpLookupSnapshotSchema,
} from "@watchdog/tools/identity";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { openpgpKeyservers } from "../../providers";
import { contact } from "../../sdk";
import { pgpLookupInput } from "./input";
import { interpretPgpLookupReport } from "./interpret";

export const pgpLookup = defineCollectCap({
  id: "identity.pgp.lookup",
  provider: openpgpKeyservers,
  title: "PGP lookup",
  description:
    "Search public PGP keyservers by email address, fingerprint or key ID to link a mailbox to a published key.",
  dataSource: "keys.openpgp.org / keyserver.ubuntu.com",
  input: pgpLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [
    contact.provider("keys.openpgp.org"),
    contact.provider("keyserver.ubuntu.com"),
  ],
  consumes: [
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "pgp" },
  ],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "pgp" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: pgpLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* pgpLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`PGP lookup ${query}`);
      const snap = yield* fetchPgpLookupEffect(query, ctx.signal, {
        userAgent,
      });
      ctx.log(`keys=${snap.keys.length} source=${snap.source ?? "none"}`);
      return { snap, artifactName: "pgp-lookup.json" };
    }),
  interpretSnap: interpretPgpLookupReport,
});
