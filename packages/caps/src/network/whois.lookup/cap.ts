import { Effect } from "effect";

import {
  fetchRdapWhoisEffect,
  normalizeHost,
  whoisSnapshotSchema,
} from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { rdap } from "../../providers";
import { whoisLookupInput } from "./input";
import { interpretWhoisReport } from "./interpret";

export const whoisLookup = defineCollectCap({
  id: "network.whois.lookup",
  version: "1",
  provider: rdap,
  title: "WHOIS lookup",
  description:
    "Look up a domain's registration record over RDAP: registrar, key dates and nameservers.",
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
