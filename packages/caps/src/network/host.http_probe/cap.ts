import { Effect } from "effect";

import {
  fetchHttpProbeEffect,
  httpProbeSnapshotSchema,
} from "@watchdog/tools/http";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { targetHost } from "../../providers";
import { httpProbeInput } from "./input";
import { interpretHttpProbeReport } from "./interpret";

export const httpProbe = defineCollectCap({
  id: "network.host.http_probe",
  version: "1",
  provider: targetHost,
  title: "HTTP surface",
  description:
    "Request a host's web server and record its security headers, security.txt, favicon hash and any CDN or firewall in front of it.",
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
  fetch: (ctx, { userAgent }) =>
    Effect.gen(function* httpProbeFetch() {
      const host = normalizeHost(ctx.input.host);
      ctx.log(`HTTP probe ${host}`);
      const snap = yield* fetchHttpProbeEffect(host, ctx.signal, {
        userAgent,
      });
      ctx.log(
        `status=${snap.status} headers=${Object.keys(snap.securityHeaders).length} security.txt=${snap.securityTxt.present}`
      );
      return { snap, artifactName: `http-probe-${host}.json` };
    }),
  interpretSnap: interpretHttpProbeReport,
});
