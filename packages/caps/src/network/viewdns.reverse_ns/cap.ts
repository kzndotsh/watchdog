import { Effect } from "effect";

import {
  fetchViewDnsReverseHostEffect,
  viewDnsReverseHostSnapshotSchema,
} from "#tools/network";
import { normalizeHost } from "#tools/normalize";

import { viewDnsApiKey } from "../../credentials";
import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { viewDns } from "../../providers";
import { contact } from "../../sdk";
import { viewDnsReverseNsInput } from "./input";
import { interpretViewDnsReverseNsReport } from "./interpret";

export const viewDnsReverseNs = defineCollectCap({
  id: "network.viewdns.reverse_ns",
  provider: viewDns,
  title: "ViewDNS reverse nameserver",
  description:
    "List domains that use a given nameserver, through ViewDNS. Sharing a nameserver does not show common ownership.",
  dataSource: "api.viewdns.info/reversens",
  input: viewDnsReverseNsInput,
  timeoutMs: 60_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("api.viewdns.info", { keyed: true })],
  credentials: [{ slot: viewDnsApiKey }],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 24 * 60 * 60_000,
  },
  schema: viewDnsReverseHostSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* viewDnsReverseNsFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`ViewDNS reverse NS ${host}`);
      const key = yield* ctx.getCredential("VIEWDNS_API_KEY");
      const snap = yield* fetchViewDnsReverseHostEffect(
        host,
        "ns",
        key,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`domains=${snap.domains.length} counted=${snap.domainCount}`);
      return { snap, artifactName: `viewdns-reverse-ns-${host}.json` };
    }),
  interpretSnap: interpretViewDnsReverseNsReport,
});
