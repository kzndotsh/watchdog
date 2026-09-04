import { Effect } from "effect";

import { fetchMailConfigEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { mailConfigInput } from "./input";
import { interpretMailConfigReport } from "./interpret";
import { mailConfigSnapshotSchema } from "./report-schema";

export const mailConfig = defineCollectCap({
  id: "network.domain.mail_config",
  version: "1",
  title: "Mail config",
  description:
    "MX / SPF / DMARC / common-selector DKIM posture for a hostname — how mail is supposed to be authenticated for this domain.",
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
  reportLabel: "domain.mail_config",
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
