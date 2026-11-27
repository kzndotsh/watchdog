import { Effect } from "effect";

import {
  fetchViewDnsReverseWhoisEffect,
  viewDnsReverseWhoisSnapshotSchema,
} from "#tools/network";

import { viewDnsApiKey } from "../../credentials";
import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { viewDns } from "../../providers";
import { contact } from "../../sdk";
import { viewDnsReverseWhoisInput } from "./input";
import { interpretViewDnsReverseWhoisReport } from "./interpret";

export const viewDnsReverseWhois = defineCollectCap({
  id: "network.viewdns.reverse_whois",
  provider: viewDns,
  title: "ViewDNS reverse WHOIS",
  description:
    "List domains whose WHOIS record mentions an email address, person or organization, through ViewDNS. A WHOIS match does not prove the same registrant.",
  dataSource: "api.viewdns.info/reversewhois",
  input: viewDnsReverseWhoisInput,
  timeoutMs: 60_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("api.viewdns.info", { keyed: true })],
  credentials: [{ slot: viewDnsApiKey }],
  consumes: [{ kind: "identifier", type: "email" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 24 * 60 * 60_000,
  },
  schema: viewDnsReverseWhoisSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* viewDnsReverseWhoisFetch() {
      const { query } = ctx.input;
      ctx.log("ViewDNS reverse WHOIS");
      const key = yield* ctx.getCredential("VIEWDNS_API_KEY");
      const snap = yield* fetchViewDnsReverseWhoisEffect(
        query,
        key,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`matches=${snap.matches.length} counted=${snap.resultCount}`);
      return { snap, artifactName: "viewdns-reverse-whois.json" };
    }),
  interpretSnap: interpretViewDnsReverseWhoisReport,
});
