import { Effect } from "effect";

import { fetchC99SubdomainsEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { c99LookupInput } from "./input";
import { interpretC99LookupReport } from "./interpret";
import { c99LookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.c99.lookup; OSINT)";

export const c99Lookup = defineCollectCap({
  id: "network.c99.lookup",
  version: "1",
  title: "C99 subdomain finder",
  description:
    "Paid subdomain finder for a domain — single commercial source, not a multi-engine enumerate.",
  dataSource: "api.c99.nl/subdomainfinder",
  input: c99LookupInput,
  timeoutMs: 120_000,
  kind: "collect",
  flags: ["needs_key", "third_party", "slow"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  formOmit: ["entityId", "realtime"],
  credentials: [{ name: "C99_API_KEY" }],
  consumes: [{ kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: c99LookupSnapshotSchema,
  reportLabel: "c99.lookup",
  fetch: (ctx) =>
    Effect.gen(function* c99LookupFetch() {
      const host = normalizeHost(ctx.input.host);
      const realtime = ctx.input.realtime === true;
      ctx.log(`C99 subdomainfinder ${host} realtime=${realtime}`);
      const key = yield* ctx.getCredential("C99_API_KEY");
      const snap = yield* fetchC99SubdomainsEffect(host, key, ctx.signal, {
        userAgent: UA,
        realtime,
      });
      ctx.log(
        `domains=${snap.domains.length}${snap.error ? ` error=${snap.error}` : ""}`
      );
      return { snap, artifactName: `c99-${host}.json` };
    }),
  interpretSnap: interpretC99LookupReport,
});
