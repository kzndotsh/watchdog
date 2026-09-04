import { Effect } from "effect";

import { normalizeHost, resolveDnsRecordsEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { dnsLookupInput } from "./input";
import { interpretDnsReport } from "./interpret";
import { dnsRecordsSchema } from "./report-schema";

export const dnsLookup = defineCollectCap({
  id: "network.dns.lookup",
  version: "1",
  title: "DNS lookup",
  description:
    "Resolve A/AAAA/MX/TXT/NS for a host — baseline footprint before WHOIS, mail config, or CT.",
  dataSource: "system resolver",
  input: dnsLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 10 * 60_000,
  },
  schema: dnsRecordsSchema,
  reportLabel: "dns.lookup",
  fetch: (ctx) =>
    Effect.gen(function* dnsLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`resolving ${host}`);
      const snap = yield* resolveDnsRecordsEffect(host, ctx.signal);
      return { snap, artifactName: `dns-${host}.json` };
    }),
  interpretSnap: interpretDnsReport,
});
