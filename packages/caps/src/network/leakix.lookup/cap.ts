import { Effect } from "effect";

import { fetchLeakixLookupEffect } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { leakixLookupInput } from "./input";
import { interpretLeakixLookupReport } from "./interpret";
import { leakixLookupSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.leakix.lookup; OSINT)";

export const leakixLookup = defineCollectCap({
  id: "network.leakix.lookup",
  version: "1",
  title: "LeakIX lookup",
  description:
    "Indexed exposed services and leak findings for an IP or host — open ports, misconfigs, and published leak hits.",
  dataSource: "leakix.net",
  input: leakixLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["needs_key", "third_party"],
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "LEAKIX_API_KEY" }],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: leakixLookupSnapshotSchema,
  reportLabel: "leakix.lookup",
  fetch: (ctx) =>
    Effect.gen(function* leakixLookupFetch() {
      const query = ctx.input.query.trim();
      ctx.log(`LeakIX ${query}`);
      const key = yield* ctx.getCredential("LEAKIX_API_KEY");
      const snap = yield* fetchLeakixLookupEffect(query, key, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `found=${snap.found} services=${snap.serviceCount} leaks=${snap.leakCount}`
      );
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `leakix-${safe}.json` };
    }),
  interpretSnap: interpretLeakixLookupReport,
});
