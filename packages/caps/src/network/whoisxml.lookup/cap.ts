import { Effect } from "effect";

import {
  fetchWhoisXmlEffect,
  normalizeHost,
  whoisSnapshotSchema,
} from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { whoisxml } from "../../providers";
import { whoisXmlLookupInput } from "./input";
import { interpretWhoisXmlReport } from "./interpret";

export const whoisXmlLookup = defineCollectCap({
  id: "network.whoisxml.lookup",
  provider: whoisxml,
  title: "WhoisXML lookup",
  description:
    "Look up a domain's registration record through WhoisXML. Use it when the RDAP record is thin.",
  dataSource: "WhoisXML",
  input: whoisXmlLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  credentials: [{ name: "WHOIS_API_KEY" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: whoisSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* whoisXmlLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`WhoisXML for ${host}`);
      const key = yield* ctx.getCredential("WHOIS_API_KEY");
      const snap = yield* fetchWhoisXmlEffect(host, key, ctx.signal);
      ctx.log("WhoisXML ok");
      return { snap, artifactName: `whoisxml-${host}.json` };
    }),
  interpretSnap: interpretWhoisXmlReport,
});
