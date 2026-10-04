import type { z } from "zod";

import type { TlsAuditSnapshot } from "@watchdog/tools/tls";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { tlsAuditInput } from "./input";

type TlsInput = z.infer<typeof tlsAuditInput>;

function summarize(snap: TlsAuditSnapshot): string {
  const parts: string[] = [
    `proto=${snap.protocol ?? "?"}`,
    `authorized=${snap.authorized}`,
  ];
  if (snap.cipher) parts.push(`cipher=${snap.cipher.name}`);
  if (snap.certificate?.subject) {
    parts.push(`subject=${snap.certificate.subject}`);
  }
  if (snap.certificate?.issuer) {
    parts.push(`issuer=${snap.certificate.issuer}`);
  }
  if (snap.certificate?.validTo) {
    parts.push(`validTo=${snap.certificate.validTo}`);
  }
  return parts.join("; ");
}

export function interpretTlsAuditReport(
  report: TlsAuditSnapshot,
  opts: CapInterpretOpts<TlsInput>
): CapInterpretResult {
  const text = `TLS for ${report.host}:${report.port}: ${summarize(report)}`;
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text,
    noEntitySummary: "TLS audit captured; no Entity to attach Claim",
  });
}
