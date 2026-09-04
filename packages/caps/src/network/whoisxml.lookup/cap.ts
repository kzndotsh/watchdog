import { Effect } from "effect";

import { fetchWhoisXmlEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { whoisXmlLookupInput } from "./input";
import { interpretWhoisXmlReport } from "./interpret";
import { whoisSnapshotSchema } from "./report-schema";

export const whoisXmlLookup = defineCollectCap({
  id: "network.whoisxml.lookup",
  version: "1",
  title: "WhoisXML lookup",
  description:
    "Commercial WHOIS for a hostname when RDAP is thin or you need WhoisXML’s normalized fields.",
  dataSource: "WhoisXML",
  input: whoisXmlLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  credentials: [{ name: "WHOIS_API_KEY" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: whoisSnapshotSchema,
  reportLabel: "whoisxml.lookup",
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
