import { Effect } from "effect";

import { resolveDnsRecordsEffect, dnsRecordsSchema } from "#tools/dns";
import { normalizeHost } from "#tools/normalize";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { foundOfType } from "../../lib/collect/found-values";
import { systemResolver } from "../../providers";
import { contact } from "../../sdk";
import { dnsLookupInput } from "./input";
import { interpretDnsReport } from "./interpret";

export const dnsLookup = defineCollectCap({
  id: "network.dns.lookup",
  provider: systemResolver,
  contacts: [contact.target("dns")],
  title: "DNS lookup",
  description:
    "Resolve a host's A, AAAA, MX, TXT and NS records. A good first look at a domain before WHOIS, mail config or certificate searches.",
  dataSource: "system resolver",
  input: dnsLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 10 * 60_000,
  },
  schema: dnsRecordsSchema,
  fetch: (ctx) =>
    Effect.gen(function* dnsLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`resolving ${host}`);
      const snap = yield* resolveDnsRecordsEffect(host, ctx.signal);
      return { snap, artifactName: `dns-${host}.json` };
    }),
  interpretSnap: interpretDnsReport,
  foundSnap: (snap) => [
    ...foundOfType("ip", snap.a, "A record"),
    ...foundOfType("ip", snap.aaaa, "AAAA record"),
    ...foundOfType("domain", snap.ns, "NS record"),
    ...foundOfType(
      "domain",
      snap.mx.map((mx) => mx.exchange),
      "MX record"
    ),
  ],
});
