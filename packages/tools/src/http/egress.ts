import { Cause, Context, Effect, Layer } from "effect";

import { mapToolsCatch } from "../errors/map-tools-catch";
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
import {
  assertHopAdmitted,
  assertNameAdmitted,
  type EgressPolicy,
  type HopRequest,
} from "./egress-policy";
import { describeRequestBody } from "./egress-request-body";
import {
  chainBytes,
  tlsHandshake,
  type TlsPeer,
  type TlsTarget,
} from "./egress-tls";
import { OutboundClient } from "./outbound-client";
import type { ServedSource } from "./provider-call";
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
  /**
   * For an in-process cache: the newest completed call to `url` this Job made, to keep beside
   * the value built from its answer. `undefined` when none (an `Egress` that records nothing,
   * or a body not read to the end).
   */
  readonly servedSource: (url: string) => ServedSource | undefined;
  /**
   * An in-process cache answered instead of the network: records the call as `served_from` the
   * original, with the original's body hash, so the Evidence still has a call behind it. A
   * no-op when `source` is `undefined` or the `Egress` records nothing.
   */
  readonly recordServed: (
    source: ServedSource | undefined
  ) => Effect.Effect<void, ToolsTag>;
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
  /**
   * What the running Cap declared (`egressPolicyFor(cap.contacts, input)`). With it every HTTP
   * hop, DNS name and TLS peer must be admitted, else the call is refused (`undeclared` or
   * `seed`) and recorded as failed. Absent, nothing is refused on this ground.
   */
  readonly policy?: EgressPolicy;
};

const textEncoder = new TextEncoder();

/** Waits for a call's write-ahead save; a failure is the Cap's (the call is not made). */
function awaitWritten(call: {
  readonly written: Promise<void>;
}): Effect.Effect<void, ToolsTag> {
  return Effect.tryPromise({
    try: async () => call.written,
    catch: mapToolsCatch,
  });
}

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
  const { policy } = options;
  const guard =
    policy === undefined
      ? undefined
      : (request: HopRequest) => {
          assertHopAdmitted(policy, request);
        };
  const assertName = (transport: "dns" | "tls", name: string) =>
    policy === undefined
      ? Effect.void
      : Effect.try({
          try: () => {
            assertNameAdmitted(policy, transport, name);
          },
          catch: mapToolsCatch,
        });

  const fetch: SafeFetch = async (input, init) => {
    // The caller's own `guard` is never honoured: only the Job's declaration applies.
    const guarded = { ...init, guard };
    if (ledger === undefined) return outbound.fetch(input, guarded);
    const observer = ledger.begin({
      method: init?.method ?? "GET",
      url: input,
      requestBody: await describeRequestBody(init?.body),
    });
    // Write-ahead: nothing is sent until the request side of the call is saved.
    await observer.written;
    return outbound.fetch(input, { ...guarded, observer });
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
      if (call !== undefined) yield* awaitWritten(call);
      const outcome = yield* assertName("dns", name).pipe(
        Effect.andThen(queryDns(query.type, name, signal)),
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
      if (call !== undefined) yield* awaitWritten(call);
      const peer = yield* assertName("tls", target.host).pipe(
        Effect.andThen(tlsHandshake(target)),
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
    servedSource: (url) => ledger?.servedSourceFor(url),
    recordServed: (source) =>
      ledger === undefined || source === undefined
        ? Effect.void
        : awaitWritten(ledger.recordServed(source)),
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
 * Builds a Job's `Egress` over the shared client with a fresh ledger. With `policy` (the
 * Cap's declared contacts) it refuses what the Cap did not declare; without, it only records.
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
      ...(options?.policy === undefined ? {} : { policy: options.policy }),
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
