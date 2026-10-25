import { Effect } from "effect";

import { classifyPgpQuery } from "@watchdog/schemas/caps";
import { ValidationVendorError } from "@watchdog/tools/errors";
import {
  PGP_KEYSERVERS,
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
    "Search public PGP keyservers by email address, domain, name, key ID or fingerprint, and merge what they return by fingerprint to link a mailbox or person to published keys.",
  dataSource: PGP_KEYSERVERS.map((server) => server.host).join(" / "),
  input: pgpLookupInput,
  // Five servers, three at a time, 12 s each: two rounds fit well inside this.
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: PGP_KEYSERVERS.map((server) => contact.provider(server.host)),
  consumes: [
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "domain" },
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
      const query = classifyPgpQuery(ctx.input.query);
      if (query === null) {
        return yield* new ValidationVendorError({
          message: "Invalid PGP query",
        });
      }
      ctx.log(`PGP lookup (${query.kind})`);
      const snap = yield* fetchPgpLookupEffect(query, ctx.signal, {
        userAgent,
      });
      const answered = snap.servers.filter(
        (server) => server.status === "ok" || server.status === "empty"
      ).length;
      ctx.log(
        `keys=${snap.keys.length} servers=${answered}/${snap.servers.length} answered`
      );
      return { snap, artifactName: "pgp-lookup.json" };
    }),
  interpretSnap: interpretPgpLookupReport,
});
