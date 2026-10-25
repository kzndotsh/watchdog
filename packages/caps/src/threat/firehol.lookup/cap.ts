import { Effect } from "effect";

import { normalizeIp } from "@watchdog/tools/dns";
import {
  fetchFireholLookupEffect,
  fireholLookupSnapshotSchema,
} from "@watchdog/tools/threat";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { firehol } from "../../providers";
import { contact } from "../../sdk";
import { fireholLookupInput } from "./input";
import { interpretFireholLookupReport } from "./interpret";

export const fireholLookup = defineCollectCap({
  id: "threat.firehol.lookup",
  provider: firehol,
  title: "FireHOL level1 blocklist",
  description:
    "Check whether an IP address is on the FireHOL level 1 blocklist, which combines several well-known blocklists.",
  dataSource: "iplists.firehol.org/files/firehol_level1.netset",
  input: fireholLookupInput,
  timeoutMs: 30_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  contacts: [
    contact.download("https://iplists.firehol.org/files/firehol_level1.netset"),
  ],
  consumes: [{ kind: "ip" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "ip" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  schema: fireholLookupSnapshotSchema,
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* fireholLookupFetch() {
      const ip = normalizeIp(ctx.input.ip);
      ctx.log(`FireHOL level1 ${ip}`);
      const snap = yield* fetchFireholLookupEffect(ip, ctx.signal, {
        userAgent,
      });
      ctx.log(`found=${snap.found}`);
      return { snap, artifactName: `firehol-${ip.replaceAll(":", "-")}.json` };
    }),
  interpretSnap: interpretFireholLookupReport,
});
