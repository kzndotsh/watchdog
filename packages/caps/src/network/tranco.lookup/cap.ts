import { Effect } from "effect";

import { fetchTrancoLookupEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { trancoLookupInput } from "./input";
import { interpretTrancoLookupReport } from "./interpret";
import { trancoLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.tranco.lookup; OSINT)";

export const trancoLookup = defineCollectCap({
  id: "network.tranco.lookup",
  version: "1",
  title: "Tranco top-sites rank",
  description:
    "Research-grade top-sites popularity rank for a domain. Popularity context only — not ownership or malice.",
  dataSource: "tranco-list.eu/api",
  input: trancoLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 24 * 60 * 60_000,
  },
  schema: trancoLookupSnapshotSchema,
  reportLabel: "tranco.lookup",
  fetch: (ctx) =>
    Effect.gen(function* trancoLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Tranco ${host}`);
      const snap = yield* fetchTrancoLookupEffect(host, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found} latestRank=${snap.latestRank ?? "n/a"}`);
      return { snap, artifactName: `tranco-${host}.json` };
    }),
  interpretSnap: interpretTrancoLookupReport,
});
