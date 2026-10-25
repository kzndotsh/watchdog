import { createHash } from "node:crypto";

import { Context, Effect, Layer } from "effect";

import {
  createEgressLedger,
  type EgressLedger,
  type EgressLedgerOptions,
} from "./egress-ledger";
import { OutboundClient } from "./outbound-client";
import type { RequestBodyRecord } from "./provider-call";
import type { SafeFetch, SafeFetchInit } from "./safe-fetch";

/**
 * The Job's way onto the network: the `fetch` every Cap and tool request goes through
 * (`httpClientLayer` is built on it). Core builds one per Job over the shared
 * `OutboundClient` with `makeJobEgress`, so the Job's calls are recorded in its ledger;
 * the pools, the address checks and the limits stay the client's.
 */
export type EgressApi = { readonly fetch: SafeFetch };

export class Egress extends Context.Service<Egress, EgressApi>()(
  "@watchdog/tools/http/Egress"
) {}

function sha256Of(bytes: Uint8Array | string): RequestBodyRecord {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  return {
    state: "hashed",
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data.byteLength,
  };
}

/** A request body as its SHA-256 and size; never the body. A stream or form data is `unhashable`. */
async function describeRequestBody(
  body: SafeFetchInit["body"]
): Promise<RequestBodyRecord> {
  if (body === undefined || body === null) return { state: "none" };
  if (typeof body === "string") return sha256Of(body);
  if (body instanceof URLSearchParams) return sha256Of(body.toString());
  if (body instanceof ArrayBuffer) return sha256Of(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) {
    return sha256Of(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    );
  }
  if (body instanceof Blob)
    return sha256Of(new Uint8Array(await body.arrayBuffer()));
  return { state: "unhashable" };
}

/** One Job's door and its ledger. */
export type JobEgress = {
  readonly egress: EgressApi;
  readonly ledger: EgressLedger;
};

/** An `Egress` that records each request in `ledger`: its own record and an observer on the call. */
export function egressRecordingTo(
  outbound: { readonly fetch: SafeFetch },
  ledger: EgressLedger
): EgressApi {
  const fetch: SafeFetch = async (input, init) => {
    const observer = ledger.begin({
      method: init?.method ?? "GET",
      url: input,
      requestBody: await describeRequestBody(init?.body),
    });
    return outbound.fetch(input, { ...init, observer });
  };
  return Egress.of({ fetch });
}

/**
 * Builds a Job's `Egress` over the shared client with a fresh ledger. Policy admits
 * everything; it only records.
 */
export function makeJobEgress(
  outbound: { readonly fetch: SafeFetch },
  options?: EgressLedgerOptions
): JobEgress {
  const ledger = createEgressLedger(options);
  return { egress: egressRecordingTo(outbound, ledger), ledger };
}

/**
 * An `Egress` that records nothing: the client's own `fetch`. For callers that are not a Job
 * (tests, `toolsHttpClientLayer`); the `testing` subpath exports it as a Layer.
 */
export const unrecordedEgressLayer: Layer.Layer<Egress, never, OutboundClient> =
  Layer.effect(
    Egress,
    Effect.gen(function* unrecordedEgressGen() {
      const outbound = yield* OutboundClient;
      return Egress.of({ fetch: outbound.fetch });
    })
  );
