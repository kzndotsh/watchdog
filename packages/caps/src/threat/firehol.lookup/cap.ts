import { Effect } from "effect";

import { fetchFireholLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { fireholLookupInput } from "./input";
import { interpretFireholLookupReport } from "./interpret";
import { fireholLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.firehol.lookup; OSINT)";

export const fireholLookup = defineCollectCap({
  id: "threat.firehol.lookup",
  version: "1",
  title: "FireHOL level1 blocklist",
  description:
    "Whether an IP is in FireHOL level1 (composite of dshield, feodo, bogons, spamhaus_drop, etc.). Broad blocklist membership check.",
  dataSource: "iplists.firehol.org/files/firehol_level1.netset",
  input: fireholLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "none",
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: fireholLookupSnapshotSchema,
  reportLabel: "firehol.lookup",
  fetch: (ctx) =>
    Effect.gen(function* fireholLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`FireHOL level1 ${ip}`);
      const snap = yield* fetchFireholLookupEffect(ip, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`found=${snap.found}`);
      return { snap, artifactName: `firehol-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretFireholLookupReport,
});
