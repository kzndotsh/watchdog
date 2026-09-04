import { Effect } from "effect";

import { fetchHoneydbLookupEffect, normalizeIp } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { honeydbLookupInput } from "./input";
import { interpretHoneydbLookupReport } from "./interpret";
import { honeydbLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.honeydb.lookup; OSINT)";

export const honeydbLookup = defineCollectCap({
  id: "threat.honeydb.lookup",
  version: "1",
  title: "HoneyDB lookup",
  description:
    "Honeypot sighting history and threat-list flags for an IP — network context plus whether sensors have watched it attack.",
  dataSource: "honeydb.io",
  input: honeydbLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "HONEYDB_API_ID" }, { name: "HONEYDB_API_KEY" }],
  consumes: [{ kind: "ip" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: honeydbLookupSnapshotSchema,
  reportLabel: "honeydb.lookup",
  fetch: (ctx) =>
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
        { userAgent: UA }
      );
      ctx.log(`found=${snap.found} events=${snap.historyEventCount}`);
      return { snap, artifactName: `honeydb-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretHoneydbLookupReport,
});
