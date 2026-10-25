/**
 * The Job's TLS door, below `Egress.tlsConnect` (`egress.ts`): the only code that opens a raw
 * TLS socket. Private to the egress module. It completes the handshake even for an untrusted,
 * expired or mismatched certificate, because the audit reports on it; it is not an HTTPS client.
 */
import { connect, type DetailedPeerCertificate } from "node:tls";

import { Effect } from "effect";

import { mapToolsCatch } from "../errors/map-tools-catch";
import { BlockedTargetError, type ToolsTag } from "../errors/tagged-errors";
import { abortedError } from "../errors/vendor-errors";
import {
  assertAllowedHost,
  egressProxyFromEnv,
  safeSocketLookup,
} from "./outbound-policy";

const TLS_TIMEOUT_MS = 20_000;

export type TlsTarget = {
  readonly host: string;
  readonly port: number;
  readonly servername: string;
  readonly signal: AbortSignal;
};

/** The distinguished-name fields the audit reads. */
type DnFields = {
  readonly CN?: string | string[];
  readonly O?: string | string[];
};

/** The fields of the peer's leaf certificate that the audit reads. */
export type PeerCert = {
  readonly subject?: DnFields;
  readonly issuer?: DnFields;
  readonly subjectaltname?: string;
  readonly valid_from?: string;
  readonly valid_to?: string;
  readonly fingerprint256?: string;
  readonly serialNumber?: string;
};

/** What the handshake showed: plain data, no socket. */
export type TlsPeer = {
  readonly protocol: string | null;
  readonly authorized: boolean;
  readonly authorizationError: string | null;
  readonly cipher: {
    readonly name: string;
    readonly standardName?: string;
    readonly version?: string;
  } | null;
  /** The leaf certificate; `null` when the peer sent none. */
  readonly certificate: PeerCert | null;
  /** The DER of each certificate the peer sent, leaf first. */
  readonly chain: readonly Uint8Array[];
};

/** The peer's chain as DER, leaf first; stops at a self-signed root or a repeat. */
function derChain(leaf: DetailedPeerCertificate): Uint8Array[] {
  const chain: Uint8Array[] = [];
  const seen = new Set<DetailedPeerCertificate>();
  let current: DetailedPeerCertificate | undefined = leaf;
  while (current !== undefined && !seen.has(current)) {
    // `raw` is absent on the empty object Node returns when the peer sent nothing.
    if (!(current.raw instanceof Uint8Array)) break;
    seen.add(current);
    chain.push(Uint8Array.from(current.raw));
    current = current.issuerCertificate;
  }
  return chain;
}

function handshake(
  target: TlsTarget,
  interrupt: AbortSignal
): Promise<TlsPeer> {
  const stop = AbortSignal.any([target.signal, interrupt]);
  // oxlint-disable-next-line promise/avoid-new -- wraps node:tls callback connect
  return new Promise((resolve, reject) => {
    if (stop.aborted) {
      reject(abortedError("TLS audit aborted"));
      return;
    }
    // OSINT TLS audit must complete the handshake even for untrusted /
    // expired / hostname-mismatched certs so we can report authorized +
    // authorizationError + peer certificate fields. Do not reuse this
    // pattern for general HTTPS clients.
    // codeql[js/disabling-certificate-validation]
    const socket = connect(
      {
        host: target.host,
        port: target.port,
        servername: target.servername,
        lookup: safeSocketLookup,
        rejectUnauthorized: false,
      },
      () => {
        const peer = socket.getPeerCertificate(true);
        const cipher = socket.getCipher();
        const empty = Object.keys(peer).length === 0;
        resolve({
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
          certificate: empty ? null : peer,
          chain: empty ? [] : derChain(peer),
        });
        socket.end();
      }
    );
    const onAbort = () => {
      socket.destroy(abortedError("TLS audit aborted"));
    };
    stop.addEventListener("abort", onAbort, { once: true });
    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      socket.destroy(new Error("TLS audit timed out"));
    });
    socket.on("error", (error) => {
      stop.removeEventListener("abort", onAbort);
      reject(error);
    });
    socket.on("close", () => {
      stop.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * Connects, completes the handshake and reads what the peer showed. A raw TLS socket cannot go
 * through the HTTP egress proxy, so with a proxy set it fails closed (`BlockedTargetError`,
 * `unproxied`) instead of connecting directly; a host the address policy refuses fails the same
 * way (`host` / `address`), and a name that resolves to a refused address at connect time.
 */
export function tlsHandshake(
  target: TlsTarget
): Effect.Effect<TlsPeer, ToolsTag> {
  return Effect.try({
    try: () => {
      if (egressProxyFromEnv() !== undefined) {
        throw new BlockedTargetError({ reason: "unproxied" });
      }
      assertAllowedHost(target.host);
    },
    catch: mapToolsCatch,
  }).pipe(
    Effect.andThen(
      Effect.tryPromise({
        try: async (interrupt) => handshake(target, interrupt),
        catch: mapToolsCatch,
      })
    )
  );
}

/** The bytes a TLS call is hashed over: each DER certificate of the chain, leaf first, concatenated. */
export function chainBytes(chain: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chain.reduce((n, der) => n + der.byteLength, 0));
  let offset = 0;
  for (const der of chain) {
    out.set(der, offset);
    offset += der.byteLength;
  }
  return out;
}
