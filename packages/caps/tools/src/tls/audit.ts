import { Effect } from "effect";

import type { ToolsTag } from "../errors/tagged-errors";
import { Egress } from "../http/egress";
import { snapshotFromTlsPeer } from "./audit-cert";
import { tlsAuditSnapshotSchema, type TlsAuditSnapshot } from "./audit-schema";

export { tlsAuditSnapshotSchema, type TlsAuditSnapshot };

type AuditOptions = {
  port?: number;
  servername?: string;
};

/**
 * Handshake with a host through the Job's `Egress` and report what the peer showed. The
 * door refuses a host the address policy blocks and, under an egress proxy, fails closed.
 */
export function fetchTlsAuditEffect(
  host: string,
  signal: AbortSignal,
  options?: AuditOptions
): Effect.Effect<TlsAuditSnapshot, ToolsTag, Egress> {
  const port = options?.port ?? 443;
  const servername = options?.servername ?? host;

  return Effect.gen(function* fetchTlsAuditGen() {
    const egress = yield* Egress;
    const peer = yield* egress.tlsConnect({ host, port, servername, signal });
    return snapshotFromTlsPeer(peer, host, port);
  });
}
