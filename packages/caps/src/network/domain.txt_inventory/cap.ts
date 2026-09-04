import { Effect } from "effect";

import { fetchTxtInventoryEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { txtInventoryInput } from "./input";
import { interpretTxtInventoryReport } from "./interpret";
import { txtInventorySnapshotSchema } from "./report-schema";

export const txtInventory = defineCollectCap({
  id: "network.domain.txt_inventory",
  version: "1",
  title: "TXT inventory",
  description:
    "Classify apex TXT into verification tokens, SaaS tenants, and mail-related hints — who claimed this domain in DNS.",
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
  reportLabel: "domain.txt_inventory",
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
