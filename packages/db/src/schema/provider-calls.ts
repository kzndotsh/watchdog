import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  PROVIDER_BODY_KINDS,
  PROVIDER_BODY_REASONS,
  PROVIDER_BODY_STATES,
  PROVIDER_CALL_OUTCOMES,
  PROVIDER_CALL_TRANSPORTS,
  PROVIDER_REQUEST_BODY_STATES,
} from "@watchdog/schemas/shared";
import type {
  CaseId,
  ProviderBodyKind,
  ProviderBodyReason,
  ProviderBodyState,
  ProviderCallOutcome,
  ProviderCallTransport,
  ProviderRequestBodyState,
} from "@watchdog/schemas/shared";

import { createdAt, timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { evidence } from "./evidence";
import { jobs } from "./jobs";

/** One URL a call sent a request to, as stored: redacted, with its last status and send count. */
export type StoredHop = {
  url: string;
  status: number | null;
  attempts: number;
};

/**
 * What a Job asked a provider (#495), the request side of a call. Inserted when the call is
 * sent, before any byte leaves, so a worker that dies mid-call still leaves the row (an action
 * Cap's "we submitted X" survives). The URL is redacted (credential values and secret-named
 * parameters are replaced); no request header and no request body is stored, the body only as a
 * SHA-256. Append-only: the application role may INSERT and SELECT (`AUDIT_TABLES` in
 * `app-role.ts`). Case-scoped by the composite foreign key to `jobs (id, case_id)`, so the rows
 * cascade with the Job and the Case. `run_id` names the attempt that made the call (a reclaimed
 * Job runs again under a new one); `(job_id, run_id, seq)` is unique so a repeated save is a no-op.
 */
export const providerCalls = pgTable(
  "provider_calls",
  {
    /** Assigned by the Job's ledger when the call begins, so a cache entry can name it. */
    id: uuid("id").primaryKey(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    jobId: uuid("job_id").notNull(),
    runId: uuid("run_id").notNull(),
    /** Order the calls began within the run. */
    seq: integer("seq").notNull(),
    transport: text("transport").$type<ProviderCallTransport>().notNull(),
    /** HTTP method; the record type for DNS; `TLS` for a handshake. */
    method: text("method").notNull(),
    /** Redacted. `dns:<name>?type=<rrtype>` for DNS, `tls://<host>:<port>` for TLS. */
    urlRedacted: text("url_redacted").notNull(),
    bodyKind: text("body_kind").$type<ProviderBodyKind>().notNull(),
    requestBodyState: text("request_body_state")
      .$type<ProviderRequestBodyState>()
      .notNull(),
    requestBodySha256: text("request_body_sha256"),
    requestBodyBytes: bigint("request_body_bytes", { mode: "number" }),
    startedAt: timestamptz("started_at").notNull(),
    createdAt,
  },
  (t) => [
    unique("provider_calls_job_run_seq_uq").on(t.jobId, t.runId, t.seq),
    // The target of the composite foreign keys of the outcome and the Evidence link.
    unique("provider_calls_id_case_id_uq").on(t.id, t.caseId),
    index("provider_calls_case_started_idx").on(t.caseId, t.startedAt),
    foreignKey({
      name: "provider_calls_job_id_case_id_fk",
      columns: [t.jobId, t.caseId],
      foreignColumns: [jobs.id, jobs.caseId],
    }).onDelete("cascade"),
    vocabCheck(t.transport, PROVIDER_CALL_TRANSPORTS),
    vocabCheck(t.bodyKind, PROVIDER_BODY_KINDS),
    vocabCheck(t.requestBodyState, PROVIDER_REQUEST_BODY_STATES),
    check(
      "provider_calls_request_body_hash_ck",
      sql`(${t.requestBodyState} = 'hashed') = (${t.requestBodySha256} IS NOT NULL AND ${t.requestBodyBytes} IS NOT NULL)`
    ),
  ]
);

/**
 * How a call ended (#495): status, allowlisted response headers, timing and the state of the
 * body. One row per call, inserted when the call ends (success: before Evidence lands). Append-only
 * like the request. `body_state` is a discriminated state with CHECKs: `stored` has a blob key
 * (the body, content-addressed under the Case's blob prefix) and a hash, `hashed` a hash and the
 * reason the body was not kept (over the keep limit, a fingerprint-only Cap, served from an
 * in-process cache), `partial` a hash of the prefix that was read, `none` nothing.
 * `served_from_call_id` is a soft reference (no foreign key): an in-process feed cache can serve a
 * Job in another Case, and a cross-Case key would tie one Case's purge to another's rows.
 */
export const providerCallOutcomes = pgTable(
  "provider_call_outcomes",
  {
    callId: uuid("call_id").primaryKey(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    outcome: text("outcome").$type<ProviderCallOutcome>().notNull(),
    /** Status of the final hop; for DNS the response code; for TLS 0. Null before a response. */
    status: integer("status"),
    hops: jsonb("hops").$type<StoredHop[]>().notNull(),
    /** Allowlisted response headers of the final hop, lowercase names, redacted. */
    responseHeaders: jsonb("response_headers")
      .$type<Record<string, string>>()
      .notNull(),
    /** Copied from the request row so the Case timeline reads one table. */
    startedAt: timestamptz("started_at").notNull(),
    headersMs: integer("headers_ms"),
    durationMs: integer("duration_ms"),
    /** A failed call's error class (`_tag`) and reason code, never a message (it could echo the target). */
    failureTag: text("failure_tag"),
    failureReason: text("failure_reason"),
    bodyState: text("body_state").$type<ProviderBodyState>().notNull(),
    bodyReason: text("body_reason").$type<ProviderBodyReason>(),
    bodySha256: text("body_sha256"),
    bodyBytes: bigint("body_bytes", { mode: "number" }),
    /** Object key of the stored body, `{caseId}/{sha256}/provider-response`. */
    blobKey: text("blob_key"),
    servedFromCallId: uuid("served_from_call_id"),
    endedAt: timestamptz("ended_at").notNull(),
    createdAt,
  },
  (t) => [
    index("provider_call_outcomes_case_started_idx").on(t.caseId, t.startedAt),
    foreignKey({
      name: "provider_call_outcomes_call_id_case_id_fk",
      columns: [t.callId, t.caseId],
      foreignColumns: [providerCalls.id, providerCalls.caseId],
    }).onDelete("cascade"),
    vocabCheck(t.outcome, PROVIDER_CALL_OUTCOMES),
    vocabCheck(t.bodyState, PROVIDER_BODY_STATES),
    vocabCheck(t.bodyReason, PROVIDER_BODY_REASONS),
    // The body state decides which of its fields exist: nothing on `none`, a hash on every other
    // state, a blob and no reason on `stored`, a reason and no blob on `hashed`, a reason on
    // `partial` (its blob only when the prefix fit the keep limit). Each clause is an implication
    // on a known state, so a value outside the vocabulary is refused by the vocabulary check alone.
    check(
      "provider_call_outcomes_body_shape_ck",
      sql`(${t.bodyState} <> 'none' OR (${t.bodySha256} IS NULL AND ${t.bodyBytes} IS NULL AND ${t.blobKey} IS NULL AND ${t.bodyReason} IS NULL))
        AND (${t.bodyState} NOT IN ('stored', 'hashed', 'partial') OR (${t.bodySha256} IS NOT NULL AND ${t.bodyBytes} IS NOT NULL))
        AND (${t.bodyState} <> 'stored' OR (${t.blobKey} IS NOT NULL AND ${t.bodyReason} IS NULL))
        AND (${t.bodyState} <> 'hashed' OR (${t.blobKey} IS NULL AND ${t.bodyReason} IS NOT NULL))
        AND (${t.bodyState} <> 'partial' OR ${t.bodyReason} IS NOT NULL)`
    ),
    check(
      "provider_call_outcomes_served_from_ck",
      sql`(${t.outcome} = 'served_from') = (${t.servedFromCallId} IS NOT NULL)`
    ),
  ]
);

/**
 * The calls behind a piece of Evidence (#495): the calls of the run that produced it, or, for
 * Evidence landed from a cache hit, the calls of the run the cache came from. Both ends carry the
 * Case id in a composite foreign key, so a cross-Case link is refused. The call end cascades; the
 * Evidence end is RESTRICT (forensic, as `job_evidence`), which a Case delete clears first through
 * the SECURITY DEFINER BEFORE DELETE trigger on `cases` (the application role cannot delete here).
 * Append-only.
 */
export const evidenceProviderCalls = pgTable(
  "evidence_provider_calls",
  {
    evidenceId: uuid("evidence_id").notNull(),
    callId: uuid("call_id").notNull(),
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.evidenceId, t.callId] }),
    index("evidence_provider_calls_call_id_idx").on(t.callId),
    index("evidence_provider_calls_case_id_idx").on(t.caseId),
    foreignKey({
      name: "evidence_provider_calls_evidence_id_case_id_fk",
      columns: [t.evidenceId, t.caseId],
      foreignColumns: [evidence.id, evidence.caseId],
    }).onDelete("restrict"),
    foreignKey({
      name: "evidence_provider_calls_call_id_case_id_fk",
      columns: [t.callId, t.caseId],
      foreignColumns: [providerCalls.id, providerCalls.caseId],
    }).onDelete("restrict"),
  ]
);
