import { Effect } from "effect";

import {
  fetchTrancoLookupEffect,
  trancoLookupSnapshotSchema,
} from "@watchdog/tools/network";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { tranco } from "../../providers";
import { trancoLookupInput } from "./input";
import { interpretTrancoLookupReport } from "./interpret";

export const trancoLookup = defineCollectCap({
  id: "network.tranco.lookup",
  provider: tranco,
  title: "Tranco top-sites rank",
  description:
    "Get a domain's rank in the Tranco list of popular sites. A measure of popularity only, not of ownership or intent.",
  dataSource: "tranco-list.eu/api",
  input: trancoLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 24 * 60 * 60_000,
  },
  schema: trancoLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* trancoLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Tranco ${host}`);
      const snap = yield* fetchTrancoLookupEffect(host, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} latestRank=${snap.latestRank ?? "n/a"}`);
      return { snap, artifactName: `tranco-${host}.json` };
    }),
  interpretSnap: interpretTrancoLookupReport,
});
