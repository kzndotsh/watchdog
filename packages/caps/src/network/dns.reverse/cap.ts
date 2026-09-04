import { Effect } from "effect";

import { fetchDnsReverseEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { dnsReverseInput } from "./input";
import { interpretDnsReverseReport } from "./interpret";
import { dnsReverseSnapshotSchema } from "./report-schema";

export const dnsReverse = defineCollectCap({
  id: "network.dns.reverse",
  version: "1",
  title: "Reverse DNS",
  description:
    "PTR hostnames for an IP. Names only — not ownership or definitive co-hosting.",
  dataSource: "system resolver",
  input: dnsReverseInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: dnsReverseSnapshotSchema,
  reportLabel: "dns.reverse",
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
