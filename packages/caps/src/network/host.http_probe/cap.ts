import { Effect } from "effect";

import { fetchHttpProbeEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { httpProbeInput } from "./input";
import { interpretHttpProbeReport } from "./interpret";
import { httpProbeSnapshotSchema } from "./report-schema";

const UA = "Watchdog/1.0 (+network.host.http_probe; OSINT)";

export const httpProbe = defineCollectCap({
  id: "network.host.http_probe",
  version: "1",
  title: "HTTP surface",
  description:
    "Active HTTP posture for a host: security headers, security.txt, favicon hash, CDN/WAF hints. One Cap for the origin surface.",
  dataSource: "HTTP GET/HEAD",
  input: httpProbeInput,
  timeoutMs: 45_000,
  kind: "collect",
  flags: ["invasive"],
  useCases: ["Active", "Footprint"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 15 * 60_000,
  },
  schema: httpProbeSnapshotSchema,
  reportLabel: "host.http_probe",
  fetch: (ctx) =>
    Effect.gen(function* httpProbeFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`HTTP probe ${host}`);
      const snap = yield* fetchHttpProbeEffect(host, ctx.signal, {
        userAgent: UA,
      });
      ctx.log(
        `status=${snap.status} headers=${Object.keys(snap.securityHeaders).length} security.txt=${snap.securityTxt.present}`
      );
      return { snap, artifactName: `http-probe-${host}.json` };
    }),
  interpretSnap: interpretHttpProbeReport,
});
