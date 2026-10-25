import { Effect } from "effect";

import {
  fetchTlsAuditEffect,
  tlsAuditSnapshotSchema,
} from "@watchdog/tools/tls";
import { normalizeHost } from "@watchdog/tools/whois";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { targetHost } from "../../providers";
import { tlsAuditInput } from "./input";
import { interpretTlsAuditReport } from "./interpret";

export const tlsAudit = defineCollectCap({
  id: "network.host.tls_audit",
  provider: targetHost,
  title: "TLS audit",
  description:
    "Connect to a host over TLS (port 443 by default) and record the protocol, the certificate's subject and issuer, and whether it validates.",
  dataSource: "TLS handshake",
  input: tlsAuditInput,
  timeoutMs: 30_000,
  kind: "collect",
  flags: ["invasive"],
  useCases: ["Active", "Footprint"],
  formOmit: ["entityId", "port"],
  consumes: [{ kind: "host" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    cacheTtlMs: 15 * 60_000,
  },
  schema: tlsAuditSnapshotSchema,
  fetch: (ctx) =>
    Effect.gen(function* tlsAuditFetch() {
      const host = normalizeHost(ctx.input.host);
      const port = ctx.input.port ?? 443;
      ctx.log(`TLS audit ${host}:${port}`);
      const snap = yield* fetchTlsAuditEffect(host, ctx.signal, { port });
      ctx.log(
        `proto=${snap.protocol ?? "?"} authorized=${snap.authorized} subject=${snap.certificate?.subject ?? "?"}`
      );
      return { snap, artifactName: `tls-${host}-${port}.json` };
    }),
  interpretSnap: interpretTlsAuditReport,
});
