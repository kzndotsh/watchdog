/**
 * Whether a Job's provider-call record is whole (`jobs.provenance_state`). `incomplete` says a
 * call's outcome or body could not be stored (a failed or cancelled Job whose best-effort save
 * ran out of time or failed), so an empty or short call list is a gap, not "no calls".
 */
export const PROVENANCE_STATES = ["complete", "incomplete"] as const;
export type ProvenanceState = (typeof PROVENANCE_STATES)[number];

/** How a provider call reached the network (`provider_calls.transport`). */
export const PROVIDER_CALL_TRANSPORTS = ["http", "dns", "tls"] as const;
export type ProviderCallTransport = (typeof PROVIDER_CALL_TRANSPORTS)[number];

/** What a call's recorded body is (`provider_calls.body_kind`), so a hash is never read as wire bytes. */
export const PROVIDER_BODY_KINDS = [
  "response",
  "dns_answer_json",
  "tls_peer_chain_der",
] as const;
export type ProviderBodyKind = (typeof PROVIDER_BODY_KINDS)[number];

/** How a request body was recorded: not at all, as a SHA-256, or a stream that could not be hashed. */
export const PROVIDER_REQUEST_BODY_STATES = [
  "none",
  "hashed",
  "unhashable",
] as const;
export type ProviderRequestBodyState =
  (typeof PROVIDER_REQUEST_BODY_STATES)[number];

/**
 * How a call ended (`provider_call_outcomes.outcome`): `response` (the answer arrived and was
 * read or abandoned), `failed` (it ended with an error), `unfinished` (the Job stopped while it
 * was in flight), `served_from` (an in-process cache answered; no wire call, the original call
 * is named).
 */
export const PROVIDER_CALL_OUTCOMES = [
  "response",
  "failed",
  "unfinished",
  "served_from",
] as const;
export type ProviderCallOutcome = (typeof PROVIDER_CALL_OUTCOMES)[number];

/** What is stored of a response body (`provider_call_outcomes.body_state`). */
export const PROVIDER_BODY_STATES = [
  "none",
  "stored",
  "hashed",
  "partial",
] as const;
export type ProviderBodyState = (typeof PROVIDER_BODY_STATES)[number];

/** Why a body is only hashed or only partly read (`provider_call_outcomes.body_reason`). */
export const PROVIDER_BODY_REASONS = [
  "over_limit",
  "over_job_budget",
  "hash_only",
  "served_from",
  "reader_stopped",
  "byte_cap",
  "read_failed",
] as const;
export type ProviderBodyReason = (typeof PROVIDER_BODY_REASONS)[number];
