import { Effect } from "effect";

import {
  fetchHashlookupEffect,
  hashlookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { circl } from "../../providers";
import { hashlookupLookupInput } from "./input";
import { interpretHashlookupLookupReport } from "./interpret";

export const hashlookupLookup = defineCollectCap({
  id: "threat.hashlookup.lookup",
  version: "1",
  provider: circl,
  title: "CIRCL hashlookup",
  description:
    "Known-file corpus check (NSRL-derived). A hit means “seen as known software,” not a malware verdict.",
  dataSource: "hashlookup.circl.lu",
  input: hashlookupLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  egress: "third_party",
  consumes: [{ kind: "hash" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "other" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: hashlookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* hashlookupLookupFetch() {
      const hash = ctx.input.hash;
      ctx.log(`CIRCL hashlookup ${hash}`);
      const snap = yield* fetchHashlookupEffect(hash, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found} algo=${snap.algo}`);
      return { snap, artifactName: `hashlookup-${snap.hash}.json` };
    }),
  interpretSnap: interpretHashlookupLookupReport,
});
