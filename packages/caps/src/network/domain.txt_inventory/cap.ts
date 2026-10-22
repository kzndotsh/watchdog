import { Effect } from "effect";

import {
  fetchTxtInventoryEffect,
  txtInventorySnapshotSchema,
} from "@watchdog/tools/dns";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { systemResolver } from "../../providers";
import { txtInventoryInput } from "./input";
import { interpretTxtInventoryReport } from "./interpret";

export const txtInventory = defineCollectCap({
  id: "network.domain.txt_inventory",
  version: "1",
  provider: systemResolver,
  title: "TXT inventory",
  description:
    "Sort a domain's TXT records into verification tokens, SaaS accounts and mail settings, showing which services have claimed the domain.",
  dataSource: "system resolver",
  input: txtInventoryInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: txtInventorySnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* txtInventoryFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`TXT inventory ${host}`);
      const snap = yield* fetchTxtInventoryEffect(host, ctx.signal);
      const saas = snap.tokens.filter((t) => t.kind === "verification").length;
      ctx.log(`records=${snap.records.length} verification=${saas}`);
      return { snap, artifactName: `txt-inventory-${host}.json` };
    }),
  interpretSnap: interpretTxtInventoryReport,
});
