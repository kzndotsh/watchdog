import { Effect } from "effect";

import {
  fetchMailConfigEffect,
  mailConfigSnapshotSchema,
} from "@watchdog/tools/dns";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { systemResolver } from "../../providers";
import { mailConfigInput } from "./input";
import { interpretMailConfigReport } from "./interpret";

export const mailConfig = defineCollectCap({
  id: "network.domain.mail_config",
  provider: systemResolver,
  title: "Mail config",
  description:
    "Check how a domain says its mail should be authenticated: MX, SPF, DMARC and common DKIM selectors.",
  dataSource: "system resolver",
  input: mailConfigInput,
  timeoutMs: 45_000,
  kind: "collect",
  useCases: ["Passive", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 30 * 60_000,
  },
  schema: mailConfigSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* mailConfigFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`mail config ${host}`);
      const snap = yield* fetchMailConfigEffect(host, ctx.signal);
      ctx.log(
        `MX=${snap.mx.length} SPF=${snap.spf.present} DMARC=${snap.dmarc.present} DKIM=${snap.dkim.found.length}`
      );
      return { snap, artifactName: `mail-config-${host}.json` };
    }),
  interpretSnap: interpretMailConfigReport,
});
