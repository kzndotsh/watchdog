import { Effect } from "effect";

import { fetchWhoxyWhoisEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { whoxyLookupInput } from "./input";
import { interpretWhoxyLookupReport } from "./interpret";
import { whoxyLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.whoxy.lookup; OSINT)";

export const whoxyLookup = defineCollectCap({
  id: "network.whoxy.lookup",
  version: "1",
  title: "Whoxy lookup",
  description:
    "Commercial live WHOIS for a hostname — alternate paid registrar/contact view beside WhoisXML.",
  dataSource: "api.whoxy.com",
  input: whoxyLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "WHOXY_API_KEY" }],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: whoxyLookupSnapshotSchema,
  reportLabel: "whoxy.lookup",
  fetch: (ctx) =>
    Effect.gen(function* whoxyLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`Whoxy ${host}`);
      const key = yield* ctx.getCredential("WHOXY_API_KEY");
      const snap = yield* fetchWhoxyWhoisEffect(host, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`ok=${snap.ok} registrar=${snap.registrarName ?? "none"}`);
      return { snap, artifactName: `whoxy-${host}.json` };
    }),
  interpretSnap: interpretWhoxyLookupReport,
});
