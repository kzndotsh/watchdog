import { Effect } from "effect";

import { fetchDshieldLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { dshieldLookupInput } from "./input";
import { interpretDshieldLookupReport } from "./interpret";
import { dshieldLookupSnapshotSchema } from "./report-schema";

const UA =
  "Watchdog/1.0 (+threat.dshield.lookup; OSINT; contact: osint@watchdog.invalid)";

export const dshieldLookup = defineCollectCap({
  id: "threat.dshield.lookup",
  version: "1",
  title: "SANS ISC DShield",
  description:
    "SANS ISC / DShield honeypot sightings for an IP — how often scanners/sensors have seen it attacking.",
  dataSource: "isc.sans.edu/api",
  input: dshieldLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: dshieldLookupSnapshotSchema,
  reportLabel: "dshield.lookup",
  fetch: (ctx) =>
    Effect.gen(function* dshieldLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`DShield ${ip}`);
      const snap = yield* fetchDshieldLookupEffect(ip, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `found=${snap.found} attacks=${snap.attacks ?? "n/a"} count=${snap.count ?? "n/a"}`
      );
      return { snap, artifactName: `dshield-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretDshieldLookupReport,
});
