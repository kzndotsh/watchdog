import { Effect } from "effect";

import {
  fetchCertspotterLookupEffect,
  certspotterLookupSnapshotSchema,
} from "@watchdog/tools/ct";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { certspotter } from "../../providers";
import { certspotterLookupInput } from "./input";
import { interpretCertspotterLookupReport } from "./interpret";

export const certspotterLookup = defineCollectCap({
  id: "network.certspotter.lookup",
  version: "1",
  provider: certspotter,
  title: "Cert Spotter",
  description:
    "Find certificates issued for a domain, via Cert Spotter. A second certificate-log source alongside crt.sh.",
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* certspotterLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Cert Spotter ${host}`);
      const snap = yield* fetchCertspotterLookupEffect(host, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `issuances=${snap.issuances.length} domains=${snap.domains.length}`
      );
      return { snap, artifactName: `certspotter-${host}.json` };
    }),
  interpretSnap: interpretCertspotterLookupReport,
});
