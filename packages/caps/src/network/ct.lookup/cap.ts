import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/cap-sdk";
import { fetchCrtShLookupEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { eligibleHandoffHosts } from "../../lib/collect/query-seed-batches";
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
    if (!parsed.success) return undefined;
    // Preserve "empty CT names skip DNS" — only hand off when CT returned names.
    if (parsed.data.domains.length === 0) return undefined;
    const hosts = eligibleHandoffHosts(parsed.data.host, parsed.data.domains);
    return hosts.length > 0 ? { host: hosts } : undefined;
  },
});
