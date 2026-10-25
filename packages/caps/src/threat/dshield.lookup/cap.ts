import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  DSHIELD_USER_AGENT,
  fetchDshieldLookupEffect,
  dshieldLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { dshield } from "../../providers";
import { contact } from "../../sdk";
import { dshieldLookupInput } from "./input";
import { interpretDshieldLookupReport } from "./interpret";

export const dshieldLookup = defineCollectCap({
  id: "threat.dshield.lookup",
  provider: dshield,
  title: "SANS ISC DShield",
  description:
    "See how often SANS ISC's DShield sensors have recorded an IP address attacking them.",
  dataSource: "isc.sans.edu/api",
  input: dshieldLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [contact.provider("isc.sans.edu")],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: dshieldLookupSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* dshieldLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`DShield ${ip}`);
      const snap = yield* fetchDshieldLookupEffect(ip, ctx.signal, {
        userAgent: DSHIELD_USER_AGENT,
      });
      ctx.log(
        `found=${snap.found} attacks=${snap.attacks ?? "n/a"} count=${snap.count ?? "n/a"}`
      );
      return { snap, artifactName: `dshield-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretDshieldLookupReport,
});
