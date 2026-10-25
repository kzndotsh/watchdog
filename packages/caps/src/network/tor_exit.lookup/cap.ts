import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchTorExitLookupEffect,
  torExitLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { torProject } from "../../providers";
import { contact } from "../../sdk";
import { torExitLookupInput } from "./input";
import { interpretTorExitLookupReport } from "./interpret";

export const torExitLookup = defineCollectCap({
  id: "network.tor_exit.lookup",
  provider: torProject,
  title: "Tor exit-node check",
  description:
    "Check whether an IP address is currently on the Tor Project's list of exit nodes.",
  dataSource: "check.torproject.org/exit-addresses",
  input: torExitLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.download("https://check.torproject.org/exit-addresses")],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: torExitLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* torExitLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Tor exit-list check ${ip}`);
      const snap = yield* fetchTorExitLookupEffect(ip, ctx.signal, {
        userAgent,
      });
      ctx.log(`isExit=${snap.isExit}`);
      return { snap, artifactName: `tor-exit-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretTorExitLookupReport,
});
