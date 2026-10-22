import { Effect } from "effect";

import {
  fetchDnsReverseEffect,
  normalizeIp,
  dnsReverseSnapshotSchema,
} from "@watchdog/tools/dns";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { systemResolver } from "../../providers";
import { dnsReverseInput } from "./input";
import { interpretDnsReverseReport } from "./interpret";

export const dnsReverse = defineCollectCap({
  id: "network.dns.reverse",
  version: "1",
  provider: systemResolver,
  title: "Reverse DNS",
  description:
    "Find the hostnames that an IP address points back to (PTR records). The names alone do not show who owns the IP or which sites share it.",
  dataSource: "system resolver",
  input: dnsReverseInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: dnsReverseSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* dnsReverseFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`PTR ${ip}`);
      const snap = yield* fetchDnsReverseEffect(ip, ctx.signal);
      ctx.log(`hostnames=${snap.hostnames.length}`);
      return { snap, artifactName: `ptr-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretDnsReverseReport,
});
