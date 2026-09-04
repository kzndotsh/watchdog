import { Effect } from "effect";

import { fetchRdapWhoisEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { whoisLookupInput } from "./input";
import { interpretWhoisReport } from "./interpret";
import { whoisSnapshotSchema } from "./report-schema";

export const whoisLookup = defineCollectCap({
  id: "network.whois.lookup",
  version: "1",
  title: "WHOIS lookup",
  description:
    "RDAP registration record for a hostname — registrar, dates, nameservers (free public path).",
  dataSource: "RDAP",
  input: whoisLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: whoisSnapshotSchema,
  reportLabel: "whois.lookup",
  fetch: (ctx) =>
    Effect.gen(function* whoisLookupFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`WHOIS (RDAP) for ${host}`);
      const snap = yield* fetchRdapWhoisEffect(host, ctx.signal);
      ctx.log("RDAP ok");
      return { snap, artifactName: `whois-${host}.json` };
    }),
  interpretSnap: interpretWhoisReport,
});
