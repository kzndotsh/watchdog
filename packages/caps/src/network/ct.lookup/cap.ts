import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/cap-sdk";
import { fetchCrtShLookupEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ctLookupInput } from "./input";
import { interpretCtReport } from "./interpret";
import { ctLookupSnapshotSchema } from "./report-schema";

export const ctLookup = defineCollectCap({
  id: "network.ct.lookup",
  version: "1",
  title: "Certificate transparency",
  description:
    "Certificate Transparency hostnames related to a domain (crt.sh). Primary passive subdomain / SAN discovery.",
  dataSource: "crt.sh",
  input: ctLookupInput,
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
  schema: ctLookupSnapshotSchema,
  reportLabel: "ct.lookup",
  fetch: (ctx) =>
    Effect.gen(function* ctLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`CT lookup ${host}`);
      const snap = yield* fetchCrtShLookupEffect(host, ctx.signal, {
        limit: ctx.input.limit ?? 50,
        userAgent: "Watchdog/1.0 (+network.ct.lookup; OSINT)",
      });
      ctx.log(
        `crt.sh ok — ${snap.entries.length} entries, ${snap.domains.length} domains`
      );
      return { snap, artifactName: `ct-${host}.json` };
    }),
  interpretSnap: interpretCtReport,
  handoff(report): JobHandoff | undefined {
    const parsed = ctLookupSnapshotSchema.safeParse(report);
    let bags: JobHandoff | undefined;
    if (parsed.success) {
      const seen = new Set<string>();
      const hosts: string[] = [];
      for (const raw of parsed.data.domains) {
        const host = normalizeHost(raw);
        if (host === "" || host.startsWith("*.") || host.includes("*"))
          continue;
        if (seen.has(host)) continue;
        seen.add(host);
        hosts.push(host);
      }
      if (hosts.length > 0) bags = { host: hosts };
    }
    return bags;
  },
});
