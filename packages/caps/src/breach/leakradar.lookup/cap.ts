import { Effect } from "effect";

import {
  fetchLeakradarLookupEffect,
  leakradarLookupSnapshotSchema,
} from "@watchdog/tools/breach";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { leakradar } from "../../providers";
import { contact } from "../../sdk";
import { leakradarLookupInput } from "./input";
import { interpretLeakradarLookupReport } from "./interpret";

export const leakradarLookup = defineCollectCap({
  id: "breach.leakradar.lookup",
  provider: leakradar,
  title: "LeakRadar lookup",
  description:
    "Search LeakRadar's infostealer, combolist and leak index by email address, username or domain, masked only: a domain returns counts for employees, third parties and customers, an email or username returns one page of masked records (source host, date added). Nothing is unlocked, so no password or plaintext credential is ever returned or stored.",
  dataSource: "api.leakradar.io",
  input: leakradarLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive"],
  contacts: [contact.provider("api.leakradar.io", { keyed: true })],
  credentials: [{ name: "LEAKRADAR_API_KEY" }],
  consumes: [{ kind: "host" }, { kind: "identifier", type: "email" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: leakradarLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* leakradarLookupFetch() {
      const { query, kind, page, pageSize, includeRecords } = ctx.input;
      ctx.log("LeakRadar masked lookup");
      const key = yield* ctx.getCredential("LEAKRADAR_API_KEY");
      const snap = yield* fetchLeakradarLookupEffect(query, key, ctx.signal, {
        userAgent,
        page,
        pageSize,
        includeRecords,
        ...(kind === undefined ? {} : { kind }),
      });
      ctx.log(`found=${snap.found} total=${snap.total}`);
      const safe = snap.query.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
      return { snap, artifactName: `leakradar-${safe}.json` };
    }),
  interpretSnap: interpretLeakradarLookupReport,
});
