import { Effect } from "effect";

import { fetchTlsAuditEffect, normalizeHost } from "@watchdog/tools";

import { defineCollectCap } from "../../lib/collect/define-collect-cap";
import { tlsAuditInput } from "./input";
import { interpretTlsAuditReport } from "./interpret";
import { tlsAuditSnapshotSchema } from "./report-schema";

export const tlsAudit = defineCollectCap({
  id: "network.host.tls_audit",
  version: "1",
  title: "TLS audit",
  description:
    "Active TLS handshake against a host (default :443) — protocol, cert subject/issuer, and authorization result.",
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
  reportLabel: "host.tls_audit",
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
