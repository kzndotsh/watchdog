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
import { viewDnsReverseMxInput } from "./input";
import { interpretViewDnsReverseMxReport } from "./interpret";

export const viewDnsReverseMx = defineCollectCap({
  id: "network.viewdns.reverse_mx",
  provider: viewDns,
  title: "ViewDNS reverse mail server",
  description:
    "List domains that use a given mail server, through ViewDNS. Sharing a mail server does not show common ownership.",
  dataSource: "api.viewdns.info/reversemx",
  input: viewDnsReverseMxInput,
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
    Effect.gen(function* viewDnsReverseMxFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`ViewDNS reverse MX ${host}`);
      const key = yield* ctx.getCredential("VIEWDNS_API_KEY");
      const snap = yield* fetchViewDnsReverseHostEffect(
        host,
        "mx",
        key,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`domains=${snap.domains.length} counted=${snap.domainCount}`);
      return { snap, artifactName: `viewdns-reverse-mx-${host}.json` };
    }),
  interpretSnap: interpretViewDnsReverseMxReport,
});
