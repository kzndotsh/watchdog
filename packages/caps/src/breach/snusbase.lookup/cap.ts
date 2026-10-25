import { Effect } from "effect";

import {
  fetchSnusbaseLookupEffect,
  snusbaseLookupSnapshotSchema,
} from "@watchdog/tools/breach";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { snusbase } from "../../providers";
import { snusbaseLookupInput } from "./input";
import { interpretSnusbaseLookupReport } from "./interpret";

export const snusbaseLookup = defineCollectCap({
  id: "breach.snusbase.lookup",
  provider: snusbase,
  title: "Snusbase lookup",
  description:
    "Search Snusbase's breach and combolist data by email address, IP address, domain or username. Results can include passwords and password hashes; a capped sample is kept as Evidence.",
  dataSource: "api.snusbase.com",
  input: snusbaseLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  egress: "third_party",
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
      });
      ctx.log(`found=${snap.found} total=${snap.total}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `snusbase-${safe}.json` };
    }),
  interpretSnap: interpretSnusbaseLookupReport,
});
