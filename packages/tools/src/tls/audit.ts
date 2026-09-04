import { connect, type PeerCertificate } from "node:tls";

import { Effect } from "effect";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";

export const tlsAuditSnapshotSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  queriedAt: z.string().min(1),
  protocol: z.string().nullable(),
  authorized: z.boolean(),
  authorizationError: z.string().nullable(),
  cipher: z
    .object({
      name: z.string(),
      standardName: z.string().optional(),
      version: z.string().optional(),
    })
    .nullable(),
  certificate: z
    .object({
      subject: z.string().nullable(),
      issuer: z.string().nullable(),
      validFrom: z.string().nullable(),
      validTo: z.string().nullable(),
      fingerprint256: z.string().nullable(),
      subjectAltNames: z.array(z.string()),
      serialNumber: z.string().nullable(),
    })
    .nullable(),
});

export type TlsAuditSnapshot = z.infer<typeof tlsAuditSnapshotSchema>;

function dnField(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function certField(
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

interface AuditOptions {
  port?: number;
  servername?: string;
}

export function fetchTlsAuditEffect(
  host: string,
  signal: AbortSignal,
  options?: AuditOptions
): Effect.Effect<TlsAuditSnapshot, ToolsTag> {
  const port = options?.port ?? 443;
  const servername = options?.servername ?? host;

  return Effect.tryPromise({
    try: () =>
      // oxlint-disable-next-line promise/avoid-new -- wraps node:tls callback connect
      new Promise<TlsAuditSnapshot>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("TLS audit aborted"));
          return;
        }

        const socket = connect(
          {
            host,
            port,
            servername,
            rejectUnauthorized: false,
          },
          () => {
            const peer = socket.getPeerCertificate(true);
            const cipher = socket.getCipher();
            const snap: TlsAuditSnapshot = {
              host,
              port,
              queriedAt: new Date().toISOString(),
              protocol: socket.getProtocol() ?? null,
              authorized: socket.authorized,
              authorizationError: socket.authorizationError
                ? String(socket.authorizationError)
                : null,
              cipher: cipher
                ? {
                    name: cipher.name,
                    ...(cipher.standardName
                      ? { standardName: cipher.standardName }
                      : {}),
                    ...(cipher.version ? { version: cipher.version } : {}),
                  }
                : null,
              certificate: certField(peer),
            };
            socket.end();
            resolve(tlsAuditSnapshotSchema.parse(snap));
          }
        );

        const onAbort = () => {
          socket.destroy(new Error("TLS audit aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });

        socket.setTimeout(20_000, () => {
          socket.destroy(new Error("TLS audit timed out"));
        });
        socket.on("error", (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
        socket.on("close", () => {
          signal.removeEventListener("abort", onAbort);
        });
      }),
    catch: mapToolsCatch,
  });
}
