import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchHoneydbLookupEffect,
  honeydbLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { honeydb } from "../../providers";
import { honeydbLookupInput } from "./input";
import { interpretHoneydbLookupReport } from "./interpret";

export const honeydbLookup = defineCollectCap({
  id: "threat.honeydb.lookup",
  provider: honeydb,
  title: "HoneyDB lookup",
  description:
    "Get HoneyDB's honeypot history for an IP address: whether its sensors saw it attack, and any threat lists it is on.",
  dataSource: "honeydb.io",
  input: honeydbLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "HONEYDB_API_ID" }, { name: "HONEYDB_API_KEY" }],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: honeydbLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* honeydbLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`HoneyDB ${ip}`);
      const apiId = yield* ctx.getCredential("HONEYDB_API_ID");
      const apiKey = yield* ctx.getCredential("HONEYDB_API_KEY");
      const snap = yield* fetchHoneydbLookupEffect(
        ip,
        apiId,
        apiKey,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`found=${snap.found} events=${snap.historyEventCount}`);
      return { snap, artifactName: `honeydb-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretHoneydbLookupReport,
});
