import { Effect } from "effect";

import { fetchTorExitLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { torExitLookupInput } from "./input";
import { interpretTorExitLookupReport } from "./interpret";
import { torExitLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.tor_exit.lookup; OSINT)";

export const torExitLookup = defineCollectCap({
  id: "network.tor_exit.lookup",
  version: "1",
  title: "Tor exit-node check",
  description:
    "Whether an IP currently appears on the Tor Project exit-address list — useful for noise vs. exit-node traffic.",
  dataSource: "check.torproject.org/exit-addresses",
  input: torExitLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "none",
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: torExitLookupSnapshotSchema,
  reportLabel: "tor_exit.lookup",
  fetch: (ctx) =>
    Effect.gen(function* torExitLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Tor exit-list check ${ip}`);
      const snap = yield* fetchTorExitLookupEffect(ip, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(`isExit=${snap.isExit}`);
      return { snap, artifactName: `tor-exit-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretTorExitLookupReport,
});
