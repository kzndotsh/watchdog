import type { PeerCertificate, TLSSocket } from "node:tls";

import { tlsAuditSnapshotSchema, type TlsAuditSnapshot } from "./audit-schema";

function dnField(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function certField(
  cert: PeerCertificate | null
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

function cipherField(
  cipher: ReturnType<TLSSocket["getCipher"]> | undefined
): TlsAuditSnapshot["cipher"] {
  if (!cipher) return null;
  return {
    name: cipher.name,
    ...(cipher.standardName ? { standardName: cipher.standardName } : {}),
    ...(cipher.version ? { version: cipher.version } : {}),
  };
}

/** Build a typed TLS audit snapshot from an open socket (handshake complete). */
export function snapshotFromTlsSocket(
  socket: TLSSocket,
  host: string,
  port: number
): TlsAuditSnapshot {
  const peer = socket.getPeerCertificate(true);
  return tlsAuditSnapshotSchema.parse({
    host,
    port,
    queriedAt: new Date().toISOString(),
    protocol: socket.getProtocol() ?? null,
    authorized: socket.authorized,
    authorizationError: socket.authorizationError
      ? String(socket.authorizationError)
      : null,
    cipher: cipherField(socket.getCipher()),
    certificate: certField(peer),
  });
}
