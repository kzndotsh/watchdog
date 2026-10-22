import { Effect } from "effect";

import {
  fetchOtxLookupEffect,
  otxLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { otxLookupInput } from "./input";
import { interpretOtxLookupReport } from "./interpret";

export const otxLookup = defineCollectCap({
  id: "threat.otx.lookup",
  version: "1",
  title: "OTX lookup",
  description:
    "Pulse membership and malware-family names for an IP, domain, URL, or hash from the OTX community.",
  dataSource: "otx.alienvault.com",
  input: otxLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  credentials: [{ name: "OTX_API_KEY" }],
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
  schema: otxLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* otxLookupFetch() {
      const query = ctx.input.query;
      ctx.log(`OTX ${query}`);
      const key = yield* ctx.getCredential("OTX_API_KEY");
      const snap = yield* fetchOtxLookupEffect(query, key, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} pulses=${snap.pulseCount}`);
      const safe = query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `otx-${safe}.json` };
    }),
  interpretSnap: interpretOtxLookupReport,
});
