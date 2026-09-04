import { Effect } from "effect";

import { fetchCertspotterLookupEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { certspotterLookupInput } from "./input";
import { interpretCertspotterLookupReport } from "./interpret";
import { certspotterLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.certspotter.lookup; OSINT)";

export const certspotterLookup = defineCollectCap({
  id: "network.certspotter.lookup",
  version: "1",
  title: "Cert Spotter",
  description:
    "Certificate Transparency issuances via Cert Spotter — second CT source beside crt.sh when you want another feed.",
  dataSource: "api.certspotter.com/v1/issuances",
  input: certspotterLookupInput,
  timeoutMs: 60_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: certspotterLookupSnapshotSchema,
  reportLabel: "certspotter.lookup",
  fetch: (ctx) =>
    Effect.gen(function* certspotterLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Cert Spotter ${host}`);
      const snap = yield* fetchCertspotterLookupEffect(host, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `issuances=${snap.issuances.length} domains=${snap.domains.length}`
      );
      return { snap, artifactName: `certspotter-${host}.json` };
    }),
  interpretSnap: interpretCertspotterLookupReport,
});
