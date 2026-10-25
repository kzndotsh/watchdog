import { Cause, Context, Effect, Layer } from "effect";

import type { BlockedTargetError, ToolsTag } from "../errors/tagged-errors";
import { llmFetchFor, type AiOutbound, type LlmFetch } from "./egress-ai";
import {
  canonicalJson,
  dnsQueryName,
  queryDns,
  type DnsAnswers,
  type DnsRecordType,
} from "./egress-dns";
import {
  createEgressLedger,
  type EgressLedger,
  type EgressLedgerOptions,
} from "./egress-ledger";
import { describeRequestBody } from "./egress-request-body";
import {
  chainBytes,
  tlsHandshake,
  type TlsPeer,
  type TlsTarget,
} from "./egress-tls";
import { OutboundClient } from "./outbound-client";
import type { SafeFetch } from "./safe-fetch";

export type { DnsAnswers, DnsRecordType, MxRecord } from "./egress-dns";
export type { LlmFetch } from "./egress-ai";
export type { PeerCert, TlsPeer, TlsTarget } from "./egress-tls";

/** One DNS question. */
export type DnsQuery<T extends DnsRecordType> = {
  readonly type: T;
  /** A name, normalized by the tools host normalizer; for `PTR` the address to reverse. */
  readonly name: string;
};

/**
 * The Job's way onto the network: the `fetch` every Cap and tool request goes through
 * (`httpClientLayer` is built on it), and the doors for the transports that bypass it. Core
 * builds one per Job with `makeJobEgress` over the shared `OutboundClient`, so every call is
 * recorded in the Job's ledger; the pools, the address checks and the limits stay the client's.
 */
export type EgressApi = {
  readonly fetch: SafeFetch;
  /**
   * One DNS query on the system resolver, recorded as a `dns` call (`dns:<name>?type=<type>`,
   * status the response code, body the parsed answer as canonical JSON). NXDOMAIN, no data
   * and SERVFAIL are answers (empty, with their code); other resolver faults fail. An abort
   * of `signal` or an interrupt of the fiber cancels the resolver.
   */
  readonly resolve: <T extends DnsRecordType>(
    query: DnsQuery<T>,
    signal: AbortSignal
  ) => Effect.Effect<DnsAnswers[T], ToolsTag>;
  /**
   * A TLS handshake that accepts any certificate, recorded as a `tls` call
   * (`tls://<host>:<port>`, body the peer's DER chain). Fails closed under an egress proxy
   * and for a host the address policy refuses; both refusals are recorded.
   */
  readonly tlsConnect: (target: TlsTarget) => Effect.Effect<TlsPeer, ToolsTag>;
  /**
   * The `fetch` for a model call to `origin`, after the Cap resolved its provider once. Admits
   * the fixed Anthropic host, any public origin (through the shared client's guard, proxy and
   * limits) and a private origin only when the operator listed it. Redirects are refused and
   * the response is recorded hash-only. A refused origin is `BlockedTargetError` (`ai_origin`).
   */
  readonly llmFetchFor: (
    origin: string
  ) => Effect.Effect<LlmFetch, BlockedTargetError>;
};

export class Egress extends Context.Service<Egress, EgressApi>()(
  "@watchdog/tools/http/Egress"
) {}

/** One Job's door and its ledger. */
export type JobEgress = {
  readonly egress: EgressApi;
  readonly ledger: EgressLedger;
};

/** What `makeEgress` needs of the client: the public door and the private-origin door. */
export type EgressOutbound = AiOutbound;

export type EgressOptions = {
  /**
   * Origins the operator allows a model call to reach although they are private or loopback
   * (`WD_AI_PRIVATE_ORIGINS`). Default: none.
   */
  readonly privateAiOrigins?: readonly string[];
};

const textEncoder = new TextEncoder();

/**
 * Builds an `Egress` over the client. With a `ledger` it records every call (its own record
 * and, for HTTP, an observer on the call); without one it records nothing.
 */
export function makeEgress(
  outbound: EgressOutbound,
  options: EgressOptions & { readonly ledger?: EgressLedger } = {}
): EgressApi {
  const { ledger } = options;
  const privateOrigins = options.privateAiOrigins ?? [];

  const fetch: SafeFetch = async (input, init) => {
    if (ledger === undefined) return outbound.fetch(input, init);
    const observer = ledger.begin({
      method: init?.method ?? "GET",
      url: input,
      requestBody: await describeRequestBody(init?.body),
    });
    return outbound.fetch(input, { ...init, observer });
  };

  const resolve: EgressApi["resolve"] = (query, signal) =>
    Effect.gen(function* resolveGen() {
      const name = yield* dnsQueryName(query.type, query.name);
      const call = ledger?.beginDirect({
        transport: "dns",
        method: query.type,
        url: `dns:${name}?type=${query.type}`,
        bodyKind: "dns_answer_json",
      });
      const outcome = yield* queryDns(query.type, name, signal).pipe(
        Effect.tapCause((cause) =>
          Effect.sync(() => {
            call?.failed(Cause.squash(cause));
          })
        )
      );
      call?.answered({
        status: outcome.rcode,
        body: textEncoder.encode(canonicalJson(outcome.answers)),
      });
      return outcome.answers;
    });

  const tlsConnect: EgressApi["tlsConnect"] = (target) =>
    Effect.gen(function* tlsConnectGen() {
      const call = ledger?.beginDirect({
        transport: "tls",
        method: "TLS",
        url: `tls://${target.host}:${target.port}`,
        bodyKind: "tls_peer_chain_der",
      });
      const peer = yield* tlsHandshake(target).pipe(
        Effect.tapCause((cause) =>
          Effect.sync(() => {
            call?.failed(Cause.squash(cause));
          })
        )
      );
      call?.answered({ status: 0, body: chainBytes(peer.chain) });
      return peer;
    });

  return Egress.of({
    fetch,
    resolve,
    tlsConnect,
    llmFetchFor: (origin) =>
      llmFetchFor(outbound, ledger, privateOrigins, origin),
  });
}

/** An `Egress` that records each call in `ledger`. */
export function egressRecordingTo(
  outbound: EgressOutbound,
  ledger: EgressLedger,
  options?: EgressOptions
): EgressApi {
  return makeEgress(outbound, { ...options, ledger });
}

/**
 * Builds a Job's `Egress` over the shared client with a fresh ledger. Policy admits
 * everything but the model-origin rule; it only records.
 */
export function makeJobEgress(
  outbound: EgressOutbound,
  options?: EgressLedgerOptions & EgressOptions
): JobEgress {
  const ledger = createEgressLedger(options);
  return {
    egress: makeEgress(outbound, {
      ...(options?.privateAiOrigins === undefined
        ? {}
        : { privateAiOrigins: options.privateAiOrigins }),
      ledger,
    }),
    ledger,
  };
}

/**
 * An `Egress` that records nothing: the client's own `fetch` and the same doors. For callers
 * that are not a Job (tests, `toolsHttpClientLayer`); the `testing` subpath exports it as a
 * Layer.
 */
export const unrecordedEgressLayer: Layer.Layer<Egress, never, OutboundClient> =
  Layer.effect(
    Egress,
    Effect.gen(function* unrecordedEgressGen() {
      const outbound = yield* OutboundClient;
      return makeEgress(outbound);
    })
  );
