import { Effect } from "effect";

import { fetchMnemonicPdnsEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { mnemonicLookupInput } from "./input";
import { interpretMnemonicLookupReport } from "./interpret";
import { mnemonicLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.mnemonic.lookup; OSINT)";

export const mnemonicLookup = defineCollectCap({
  id: "network.mnemonic.lookup",
  version: "1",
  title: "Mnemonic PassiveDNS",
  description:
    "Historical PassiveDNS for an IP or domain. Past resolutions are not ownership.",
  dataSource: "api.mnemonic.no/pdns/v3",
  input: mnemonicLookupInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: mnemonicLookupSnapshotSchema,
  reportLabel: "mnemonic.lookup",
  fetch: (ctx) =>
    Effect.gen(function* mnemonicLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`Mnemonic PDNS ${query}`);
      const snap = yield* fetchMnemonicPdnsEffect(query, ctx.signal, {
        userAgent: UA,
        limit: 50,
      });
      ctx.log(
        `kind=${snap.kind} records=${snap.records.length} domains=${snap.domains.length}`
      );
      const safeName = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `mnemonic-${safeName}.json` };
    }),
  interpretSnap: interpretMnemonicLookupReport,
});
