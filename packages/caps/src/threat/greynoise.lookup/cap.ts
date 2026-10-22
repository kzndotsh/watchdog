import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchGreynoiseCommunityEffect,
  greynoiseLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { optionalCapCredential } from "../../sdk";
import { greynoiseLookupInput } from "./input";
import { interpretGreynoiseLookupReport } from "./interpret";

export const greynoiseLookup = defineCollectCap({
  id: "threat.greynoise.lookup",
  version: "1",
  title: "GreyNoise Community",
  description:
    "Whether an IP is internet background noise and/or a known benign service (RIOT). Helps filter scanner chatter from targeted traffic.",
  dataSource: "api.greynoise.io/v3/community",
  input: greynoiseLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "GREYNOISE_API_KEY", optional: true }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: greynoiseLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* greynoiseLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`GreyNoise Community ${ip}`);
      const apiKey = yield* optionalCapCredential(ctx, "GREYNOISE_API_KEY");
      const snap = yield* fetchGreynoiseCommunityEffect(ip, ctx.signal, {
        userAgent,
        apiKey,
      });
      ctx.log(
        `noise=${snap.noise ?? "?"} riot=${snap.riot ?? "?"} class=${snap.classification ?? "?"}`
      );
      return {
        snap,
        artifactName: `greynoise-${ip.replaceAll(":", "-")}.json`,
      };
    }),
  interpretSnap: interpretGreynoiseLookupReport,
});
