import { Effect } from "effect";

import {
  fetchLeakixLookupEffect,
  leakixLookupSnapshotSchema,
} from "@watchdog/tools/network";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { leakix } from "../../providers";
import { leakixLookupInput } from "./input";
import { interpretLeakixLookupReport } from "./interpret";

export const leakixLookup = defineCollectCap({
  id: "network.leakix.lookup",
  provider: leakix,
  title: "LeakIX lookup",
  description:
    "See what LeakIX has found exposed on an IP address or host: open services, misconfigurations and published leaks.",
  dataSource: "leakix.net",
  input: leakixLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "LEAKIX_API_KEY" }],
  consumes: [{ kind: "ip" }, { kind: "host" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: leakixLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* leakixLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`LeakIX ${query}`);
      const key = yield* ctx.getCredential("LEAKIX_API_KEY");
      const snap = yield* fetchLeakixLookupEffect(query, key, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `found=${snap.found} services=${snap.serviceCount} leaks=${snap.leakCount}`
      );
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `leakix-${safe}.json` };
    }),
  interpretSnap: interpretLeakixLookupReport,
});
