import type { PeerCert, TlsPeer } from "../http/egress";
import { tlsAuditSnapshotSchema, type TlsAuditSnapshot } from "./audit-schema";

function dnField(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function certField(
  cert: PeerCert | null
): TlsAuditSnapshot["certificate"] {
  if (!cert || Object.keys(cert).length === 0) return null;
  const sans =
    cert.subjectaltname
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return {
    subject: dnField(cert.subject?.CN) ?? dnField(cert.subject?.O),
    issuer: dnField(cert.issuer?.CN) ?? dnField(cert.issuer?.O),
    validFrom: cert.valid_from ?? null,
    validTo: cert.valid_to ?? null,
    fingerprint256: cert.fingerprint256 ?? null,
    subjectAltNames: sans,
    serialNumber: cert.serialNumber ?? null,
  };
}

/** Build a typed TLS audit snapshot from what a completed handshake showed. */
export function snapshotFromTlsPeer(
  peer: TlsPeer,
  host: string,
  port: number
): TlsAuditSnapshot {
  return tlsAuditSnapshotSchema.parse({
    host,
    port,
    queriedAt: new Date().toISOString(),
    protocol: peer.protocol,
    authorized: peer.authorized,
    authorizationError: peer.authorizationError,
    cipher: peer.cipher,
    certificate: certField(peer.certificate),
  });
}
