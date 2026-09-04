import { Effect } from "effect";

import { fetchXforceLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { xforceLookupInput } from "./input";
import { interpretXforceLookupReport } from "./interpret";
import { xforceLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+threat.xforce.lookup; OSINT)";

export const xforceLookup = defineCollectCap({
  id: "threat.xforce.lookup",
  version: "1",
  title: "IBM X-Force Exchange lookup",
  description:
    "IBM X-Force reputation / malware counts for an IP, URL, or file hash — alternate commercial TI view beside VT.",
  dataSource: "exchange.xforce.ibmcloud.com",
  input: xforceLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "XFORCE_API_KEY" }, { name: "XFORCE_API_PASSWORD" }],
  consumes: [{ kind: "ip" }, { kind: "host" }, { kind: "url" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: xforceLookupSnapshotSchema,
  reportLabel: "xforce.lookup",
  fetch: (ctx) =>
    Effect.gen(function* xforceLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`X-Force ${query}`);
      const key = yield* ctx.getCredential("XFORCE_API_KEY");
      const password = yield* ctx.getCredential("XFORCE_API_PASSWORD");
      const snap = yield* fetchXforceLookupEffect(
        query,
        key,
        password,
        ctx.signal,
        { userAgent: UA }
      );
      ctx.log(`found=${snap.found} score=${snap.score ?? "n/a"}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `xforce-${safe}.json` };
    }),
  interpretSnap: interpretXforceLookupReport,
});
