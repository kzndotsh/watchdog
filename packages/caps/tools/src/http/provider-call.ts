/**
 * The record of one outbound call a Job made: what was asked, what came back, and proof of
 * the body. Built by the Job's `EgressLedger` (`egress-ledger.ts`); never holds a request
 * header, a request body, a `set-cookie` or a credential value.
 */

/**
 * Why a complete body was hashed but not kept: over a keep limit, or by policy (`hash_only`:
 * model responses and `breach.*` Caps, whose bodies are never stored), or because an in-process
 * cache answered (`served_from`: the original call, in another Job, holds the body).
 */
export type HashedReason =
  | "over_limit"
  | "over_job_budget"
  | "hash_only"
  | "served_from";

/** How the call reached the network. `http` goes through the shared client; DNS and TLS are the Job's own doors. */
export type CallTransport = "http" | "dns" | "tls";

/**
 * What the recorded body is, so a hash is never mistaken for a hash of wire bytes:
 * - `response`: the bytes of the HTTP response body the consumer received.
 * - `dns_answer_json`: the resolver's PARSED answer as canonical JSON (sorted keys, no
 *   whitespace). It is not a wire message: the resolver hands back parsed records.
 * - `tls_peer_chain_der`: the DER of each certificate the peer sent, leaf first, concatenated
 *   (each DER certificate is a self-delimiting ASN.1 SEQUENCE, so the chain can be split again).
 */
export type BodyKind = "response" | "dns_answer_json" | "tls_peer_chain_der";

/** Why a body was read only in part. */
export type PartialReason = "reader_stopped" | "byte_cap" | "read_failed";

/**
 * - `stored`: the whole body was read; `data` is a copy and `sha256` covers all `bytes`.
 * - `hashed`: the whole body was read; `sha256` covers it, the bytes were not kept.
 * - `partial`: the reader stopped, the byte cap cut it or a read failed; `sha256` covers only
 *   the `bytes` read (a prefix of the body), and `data` is that prefix when it fit the keep limits.
 * - `none`: no body (HEAD, 204, a failure before the response).
 * The hash is of the bytes the consumer received: the transport has already removed any
 * Content-Encoding, so it is not a hash of the bytes on the wire.
 */
export type BodyRecord =
  | {
      readonly state: "stored";
      readonly sha256: string;
      readonly bytes: number;
      readonly data: Uint8Array;
    }
  | {
      readonly state: "hashed";
      readonly sha256: string;
      readonly bytes: number;
      readonly reason: HashedReason;
    }
  | {
      readonly state: "partial";
      readonly sha256: string;
      readonly bytes: number;
      readonly reason: PartialReason;
      readonly data?: Uint8Array;
    }
  | { readonly state: "none" };

/** A request body is only ever recorded as a SHA-256; a stream cannot be hashed without consuming it. */
export type RequestBodyRecord =
  | { readonly state: "none" }
  | {
      readonly state: "hashed";
      readonly sha256: string;
      readonly bytes: number;
    }
  | { readonly state: "unhashable" };

/** One URL the call sent a request to: the original target, then each redirect target. */
export type HopRecord = {
  /** Redacted. */
  readonly url: string;
  /** Status of the last wire attempt of this hop; `null` when the hop was refused or never answered. */
  readonly status: number | null;
  /** Wire attempts made for this hop (retries after a reset or a 502/503/504 count). */
  readonly attempts: number;
};

/** A failed call, by class only: a message could echo the target. */
export type CallFailure = {
  readonly tag: string;
  readonly reason?: string;
};

export type ProviderCall = {
  /**
   * Identity of the call, assigned when it begins (a UUID). Storage keys the call by it and an
   * in-process cache names it, so a later Job can say which call its answer came from.
   */
  readonly id: string;
  /** Position in the Job's ledger: the order calls began. */
  readonly seq: number;
  readonly transport: CallTransport;
  /** HTTP method; for DNS the record type (`A`, `TXT`, ...); for TLS `TLS`. */
  readonly method: string;
  /**
   * Redacted. For DNS `dns:<name>?type=<rrtype>`; for TLS `tls://<host>:<port>`.
   */
  readonly url: string;
  readonly bodyKind: BodyKind;
  readonly requestBody: RequestBodyRecord;
  readonly hops: readonly HopRecord[];
  /**
   * `response`: the response arrived and its body ended or was abandoned. `open`: the response
   * arrived and the body is still being read. `pending`: sent, no response yet (a call
   * snapshotted while in flight). `failed`: it ended with `failure`, before or without a response.
   * `served_from`: an in-process cache answered; nothing went on the wire and `servedFrom` names
   * the call that fetched the answer.
   */
  readonly outcome: "response" | "open" | "pending" | "failed" | "served_from";
  /** For `served_from`, the id of the original call (it may belong to another Job). */
  readonly servedFrom: string | null;
  /**
   * Status of the final hop; `null` when the call failed before a response. For DNS the
   * response code (0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN); for TLS 0 once the handshake completed.
   */
  readonly status: number | null;
  /** Allowlisted response headers of the final hop, lowercase names; `location` redacted. */
  readonly responseHeaders: Readonly<Record<string, string>>;
  /** ISO-8601 time the call began. */
  readonly startedAt: string;
  /** Milliseconds until the final response headers; `null` before them. */
  readonly headersMs: number | null;
  /** Milliseconds until the body ended, failed or was abandoned; `null` while open. */
  readonly durationMs: number | null;
  readonly body: BodyRecord;
  readonly failure: CallFailure | null;
};

/**
 * What a later Job needs to say "this answer came from that call": the identity of a completed
 * call and the proof of its body, without the bytes. An in-process cache keeps one beside the
 * value it cached (`Egress.servedSource` makes it, `Egress.recordServed` spends it).
 */
export type ServedSource = {
  readonly callId: string;
  readonly transport: CallTransport;
  readonly method: string;
  /** Redacted. */
  readonly url: string;
  readonly bodyKind: BodyKind;
  readonly status: number | null;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly body: { readonly sha256: string; readonly bytes: number };
};

const RESPONSE_HEADER_NAMES: ReadonlySet<string> = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "date",
  "etag",
  "last-modified",
  "server",
  "x-request-id",
  "cf-ray",
  "location",
]);

const RATE_LIMIT_PREFIX = "x-ratelimit-";

/** True for a response header the record may keep. `set-cookie` is never one of them. */
export function isRecordedResponseHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    RESPONSE_HEADER_NAMES.has(lower) || lower.startsWith(RATE_LIMIT_PREFIX)
  );
}
