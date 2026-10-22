import { Effect } from "effect";

import {
  fetchXforceLookupEffect,
  xforceLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { ibmXforce } from "../../providers";
import { xforceLookupInput } from "./input";
import { interpretXforceLookupReport } from "./interpret";

export const xforceLookup = defineCollectCap({
  id: "threat.xforce.lookup",
  version: "1",
  provider: ibmXforce,
  title: "IBM X-Force Exchange lookup",
  description:
    "Get IBM X-Force Exchange's reputation and malware counts for an IP address, URL or file hash.",
  dataSource: "exchange.xforce.ibmcloud.com",
  input: xforceLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "XFORCE_API_KEY" }, { name: "XFORCE_API_PASSWORD" }],
  consumes: [{ kind: "ip" }, { kind: "host" }, { kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
    { kind: "identifier", type: "domain" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: xforceLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* xforceLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`X-Force ${query}`);
      const key = yield* ctx.getCredential("XFORCE_API_KEY");
      const password = yield* ctx.getCredential("XFORCE_API_PASSWORD");
      const snap = yield* fetchXforceLookupEffect(
        query,
        key,
        password,
        ctx.signal,
        { userAgent }
      );
      ctx.log(`found=${snap.found} score=${snap.score ?? "n/a"}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `xforce-${safe}.json` };
    }),
  interpretSnap: interpretXforceLookupReport,
});
