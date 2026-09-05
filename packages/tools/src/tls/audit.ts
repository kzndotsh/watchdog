import { connect, type TLSSocket } from "node:tls";

import { Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { snapshotFromTlsSocket } from "./audit-cert";
import { tlsAuditSnapshotSchema, type TlsAuditSnapshot } from "./audit-schema";

export { tlsAuditSnapshotSchema, type TlsAuditSnapshot };

interface AuditOptions {
  port?: number;
  servername?: string;
}

function rejectAsError(reject: (reason: Error) => void, err: unknown): void {
  reject(err instanceof Error ? err : new Error(String(err)));
}

function attachAbortAndTimeout(
  socket: TLSSocket,
  signal: AbortSignal,
  reject: (reason: Error) => void
): void {
  const onAbort = () => {
    socket.destroy(new Error("TLS audit aborted"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  socket.setTimeout(20_000, () => {
    socket.destroy(new Error("TLS audit timed out"));
  });
  socket.on("error", (err) => {
    signal.removeEventListener("abort", onAbort);
    rejectAsError(reject, err);
  });
  socket.on("close", () => {
    signal.removeEventListener("abort", onAbort);
  });
}

function connectTlsAudit(
  host: string,
  port: number,
  servername: string,
  signal: AbortSignal
): Promise<TlsAuditSnapshot> {
  // oxlint-disable-next-line promise/avoid-new -- wraps node:tls callback connect
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("TLS audit aborted"));
      return;
    }

    // OSINT TLS audit must complete the handshake even for untrusted /
    // expired / hostname-mismatched certs so we can report authorized +
    // authorizationError + peer certificate fields. Do not reuse this
    // pattern for general HTTPS clients.
    // codeql[js/disabling-certificate-validation]
    const socket = connect(
      {
        host,
        port,
        servername,
        rejectUnauthorized: false,
      },
      () => {
        const snap = snapshotFromTlsSocket(socket, host, port);
        socket.end();
        resolve(snap);
      }
    );

    attachAbortAndTimeout(socket, signal, reject);
  });
}

export function fetchTlsAuditEffect(
  host: string,
  signal: AbortSignal,
  options?: AuditOptions
): Effect.Effect<TlsAuditSnapshot, ToolsTag> {
  const port = options?.port ?? 443;
  const servername = options?.servername ?? host;

  return Effect.tryPromise({
    try: () => connectTlsAudit(host, port, servername, signal),
    catch: mapToolsCatch,
  });
}
