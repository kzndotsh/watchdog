import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchFeodoLookupEffect,
  feodoLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { abusech } from "../../providers";
import { optionalCapCredential } from "../../sdk";
import { feodoLookupInput } from "./input";
import { interpretFeodoLookupReport } from "./interpret";

export const feodoLookup = defineCollectCap({
  id: "threat.feodo.lookup",
  version: "1",
  provider: abusech,
  title: "Feodo Tracker lookup",
  description:
    "Check whether an IP address is on Feodo Tracker's blocklist of botnet command servers, such as Emotet, Dridex and QakBot.",
  dataSource: "feodotracker.abuse.ch",
  input: feodoLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "THREATFOX_API_KEY", optional: true }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: feodoLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* feodoLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`Feodo Tracker ${ip}`);
      const apiKey = yield* optionalCapCredential(ctx, "THREATFOX_API_KEY");
      const snap = yield* fetchFeodoLookupEffect(ip, ctx.signal, {
        userAgent,
        apiKey,
      });
      ctx.log(`found=${snap.found} malware=${snap.malware ?? "?"}`);
      return { snap, artifactName: `feodo-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretFeodoLookupReport,
});
