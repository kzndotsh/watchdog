-- The baseline (#717): the whole schema in one migration, applied to an empty database. It
-- replaced 23 incremental migrations before anyone used Watchdog; local data was wiped, not
-- migrated. A later change is a new migration after this one.
--
-- Order: the pg_trgm extension and the one function an index calls, then the tables, indexes and
-- constraints `drizzle-kit generate` wrote from `src/schema` (as generated, except
-- `CREATE SCHEMA IF NOT EXISTS "auth"`: docker/postgres/init.sql already creates it; and one
-- foreign key moved below the indexes; the snapshot `meta/0000_snapshot.json` matches this part),
-- then the hand-written SQL drizzle does not model: that moved key, the two foreign keys that
-- need a column list, every function and trigger, the UNLOGGED marker
-- table and the function privileges. Application-role grants are not here: `applyAppRoleGrants`
-- (src/app-role.ts) applies them after every migration run.
--
-- Every function pins `search_path = pg_catalog, pg_temp` and qualifies every relation with
-- `public.`, so a session cannot shadow `cases` (or anything else) with a temp table. The
-- functions that write `graph_history` or Collect's queue are SECURITY DEFINER, so the
-- application role (`watchdog_app`) needs no write privilege on those tables.
--
-- Not tamper-resistant against the role that owns the tables (it can drop these triggers): the
-- separate application role is what makes them hold.

-- The trigram indexes (`gin_trgm_ops`, ADR-0007, #549) need pg_trgm first. It is a trusted
-- extension (Postgres 13+), so the migration owner creates it without superuser;
-- docker/postgres/init.sql runs only on a fresh volume, so it cannot live there.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- #574: the Evidence id a Job names in its input, as Collect's queue reads it. It comes before the
-- tables because the generated `jobs_input_*evidence_id_idx` indexes call it (an expression index
-- needs its function to exist).
--
-- It mirrors the queue builder's `parseTrimmedUuid(value)` followed by a comparison with a stored
-- (lowercase) Evidence id: JavaScript's `String.prototype.trim` whitespace, then zod 4's `z.uuid()`
-- form, lowercase only, because an uppercase input id never equals a stored id in the builder
-- either. Total: a non-string, junk, padding the builder would not trim, or a missing key gives
-- NULL, never an error, so a bad Cap input can never fail the transaction that flushes the queue.
-- IMMUTABLE (an index expression), with the pinned `search_path` of every function here.
CREATE FUNCTION public.collect_input_evidence_id(p_input jsonb, p_key text) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN s.t ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    THEN s.t::uuid
  END
  FROM (
    SELECT pg_catalog.regexp_replace(
      p_input ->> p_key,
      '^[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$',
      '',
      'g'
    ) AS t
    WHERE pg_catalog.jsonb_typeof(p_input -> p_key) = 'string'
  ) s
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text DEFAULT 'local:credential' NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	"case_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"subject_id" uuid,
	"group_id" uuid,
	"label" text,
	"actor_id" text,
	"actor_label" text,
	"actor_key_id" text,
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_label_len" CHECK (char_length("activity"."label") <= 200),
	CONSTRAINT "activity_kind_vocab" CHECK ("activity"."kind" IN ('task', 'job', 'playbook_run', 'proposal', 'evidence', 'entity', 'edge', 'claim', 'identifier', 'event', 'question', 'case', 'open_in')),
	CONSTRAINT "activity_action_vocab" CHECK ("activity"."action" IN ('created', 'status_changed', 'updated', 'reordered', 'deleted', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'logged', 'finished', 'accepted', 'rejected', 'captured', 'hidden', 'restored', 'attached', 'processed', 'retracted', 'resolved', 'opened'))
);
--> statement-breakpoint
CREATE TABLE "activity_cursors" (
	"consumer" text PRIMARY KEY NOT NULL,
	"xid" "xid8" NOT NULL,
	"id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_floor" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"xid" "xid8" NOT NULL,
	"id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_floor_singleton" CHECK ("activity_floor"."singleton")
);
--> statement-breakpoint
CREATE TABLE "auth"."apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "auth"."auth_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_event_kind_vocab" CHECK ("auth"."auth_event"."kind" IN ('session.created'))
);
--> statement-breakpoint
CREATE TABLE "cap_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"capability_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"cap_version" text NOT NULL,
	"job_id" uuid,
	"artifacts" jsonb NOT NULL,
	"result_summary" text,
	"ttl_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_deletion_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_deletion_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"case_name" text NOT NULL,
	"case_slug" text NOT NULL,
	"event" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"counts" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"xid" "xid8" DEFAULT pg_current_xact_id() NOT NULL,
	CONSTRAINT "case_deletion_records_event_vocab" CHECK ("case_deletion_records"."event" IN ('deleted', 'restored', 'purge_started', 'purge_failed', 'purged'))
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"organization_id" text NOT NULL,
	"allowed_egress" text[] DEFAULT '{"local","target"}' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"purge_started_at" timestamp with time zone,
	"purge_error" text,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_allowed_egress_classes" CHECK ("cases"."allowed_egress" <@ ARRAY['local', 'target', 'public_lookup', 'account_lookup', 'model']::text[]),
	CONSTRAINT "cases_allowed_egress_local" CHECK ('local' = ANY("cases"."allowed_egress"))
);
--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"claim_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_evidence_claim_id_evidence_id_pk" PRIMARY KEY("claim_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"class" text DEFAULT 'observation' NOT NULL,
	"text" text NOT NULL,
	"confidence" text NOT NULL,
	"retracted" boolean DEFAULT false NOT NULL,
	"retract_kind" text,
	"retracted_reason" text,
	"retracted_by" text,
	"retracted_at" timestamp with time zone,
	"superseded_by_claim_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "claims_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "claims_class_vocab" CHECK ("claims"."class" IN ('observation', 'assessment', 'allegation', 'other')),
	CONSTRAINT "claims_confidence_vocab" CHECK ("claims"."confidence" IN ('unverified', 'possible', 'confirmed')),
	CONSTRAINT "claims_retract_kind_vocab" CHECK ("claims"."retract_kind" IN ('retracted', 'contested', 'disproved'))
);
--> statement-breakpoint
CREATE TABLE "collect_queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sort_at" timestamp with time zone NOT NULL,
	"activity_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"hidden" boolean GENERATED ALWAYS AS ("state" = 'hidden') STORED NOT NULL,
	"entity_id" uuid,
	"capability_ids" text[] NOT NULL,
	"search_text" text NOT NULL,
	CONSTRAINT "collect_queue_kind_vocab" CHECK ("collect_queue"."kind" IN ('evidence', 'run', 'job')),
	CONSTRAINT "collect_queue_state_vocab" CHECK ("collect_queue"."state" IN ('queued', 'running', 'unprocessed', 'landed', 'failed', 'cancelled', 'hidden'))
);
--> statement-breakpoint
CREATE TABLE "collect_queue_case" (
	"case_id" uuid PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone,
	"diffed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "collect_queue_member" (
	"job_id" uuid NOT NULL,
	"row_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	CONSTRAINT "collect_queue_member_job_id_row_id_pk" PRIMARY KEY("job_id","row_id")
);
--> statement-breakpoint
CREATE TABLE "collect_queue_stale" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collect_queue_stale_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "collect_queue_tx" (
	"xid" "xid8" PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_evidence" (
	"edge_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_evidence_edge_id_evidence_id_pk" PRIMARY KEY("edge_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"predicate" text NOT NULL,
	"confidence" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "edges_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "edges_predicate_vocab" CHECK ("edges"."predicate" IN ('operates', 'owns', 'hosted_on', 'leads', 'founded', 'member_of', 'employee_of', 'associate_of', 'same_as', 'suspected_as', 'resolves_to', 'dns_via', 'mail_via', 'shares_ip_with', 'primary_domain', 'parent_of', 'registers', 'related_to')),
	CONSTRAINT "edges_confidence_vocab" CHECK ("edges"."confidence" IN ('unverified', 'possible', 'confirmed'))
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "entities_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "entities_kind_vocab" CHECK ("entities"."kind" IN ('person', 'infra', 'org'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"when" text NOT NULL,
	"what" text NOT NULL,
	"where" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"entity_id" uuid,
	"kind" text NOT NULL,
	"label" text,
	"notes" text,
	"mime" text,
	"uri" text,
	"sha256" text,
	"text" text,
	"source_url" text,
	"actor_id" text NOT NULL,
	"actor_label" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "evidence_kind_vocab" CHECK ("evidence"."kind" IN ('file', 'url_archive', 'attestation', 'other'))
);
--> statement-breakpoint
CREATE TABLE "evidence_provider_calls" (
	"evidence_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_provider_calls_evidence_id_call_id_pk" PRIMARY KEY("evidence_id","call_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"uri" text NOT NULL,
	"declared_sha256" text NOT NULL,
	"declared_mime" text NOT NULL,
	"declared_byte_length" integer NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "evidence_uploads_case_uri_uq" UNIQUE("case_id","uri")
);
--> statement-breakpoint
CREATE TABLE "finding_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"reason" text DEFAULT 'rejected' NOT NULL,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "graph_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"row_id" uuid NOT NULL,
	"op" text NOT NULL,
	"channel" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"actor_key_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_history_kind_vocab" CHECK ("graph_history"."kind" IN ('entity', 'edge', 'claim', 'identifier', 'event', 'question', 'task')),
	CONSTRAINT "graph_history_op_vocab" CHECK ("graph_history"."op" IN ('create', 'update', 'retract', 'delete')),
	CONSTRAINT "graph_history_channel_vocab" CHECK ("graph_history"."channel" IN ('dossier', 'triage_accept', 'agent_write', 'system')),
	CONSTRAINT "graph_history_op_shape" CHECK (("graph_history"."op" = 'create' AND "graph_history"."before" IS NULL AND "graph_history"."after" IS NOT NULL)
        OR ("graph_history"."op" = 'delete' AND "graph_history"."before" IS NOT NULL AND "graph_history"."after" IS NULL)
        OR ("graph_history"."op" IN ('update', 'retract') AND "graph_history"."before" IS NOT NULL AND "graph_history"."after" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "graph_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"actor_label" text,
	"channel" text NOT NULL,
	"user_overridden" boolean DEFAULT true NOT NULL,
	"confidence" text NOT NULL,
	"summary" text,
	"patch" jsonb NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_writes_channel_vocab" CHECK ("graph_writes"."channel" IN ('agent_write')),
	CONSTRAINT "graph_writes_confidence_vocab" CHECK ("graph_writes"."confidence" IN ('unverified', 'possible', 'confirmed'))
);
--> statement-breakpoint
CREATE TABLE "identifier_evidence" (
	"identifier_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identifier_evidence_identifier_id_evidence_id_pk" PRIMARY KEY("identifier_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"type" text NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"value" text NOT NULL,
	"confidence" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "identifiers_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "identifiers_type_vocab" CHECK ("identifiers"."type" IN ('email', 'handle', 'phone', 'url', 'domain', 'ip', 'crypto', 'pgp', 'credential', 'other')),
	CONSTRAINT "identifiers_confidence_vocab" CHECK ("identifiers"."confidence" IN ('unverified', 'possible', 'confirmed')),
	CONSTRAINT "identifiers_status_vocab" CHECK ("identifiers"."status" IN ('current', 'former', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "auth"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_evidence" (
	"job_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "job_evidence_job_id_evidence_id_pk" PRIMARY KEY("job_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "job_start_counters" (
	"scope" text NOT NULL,
	"subject_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "job_start_counters_pk" PRIMARY KEY("scope","subject_id","window_start"),
	CONSTRAINT "job_start_counters_scope_vocab" CHECK ("job_start_counters"."scope" IN ('organization', 'key'))
);
--> statement-breakpoint
CREATE TABLE "job_start_limits" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"organization_id" text NOT NULL,
	"key_id" text,
	"max_starts" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_start_limits_max_starts_range" CHECK ("job_start_limits"."max_starts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"capability_id" text NOT NULL,
	"cap_version" text,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"error_code" text,
	"interpret_error" text,
	"proposal_id" uuid,
	"result_summary" text,
	"from_cache" boolean DEFAULT false NOT NULL,
	"cache_source_job_id" uuid,
	"provenance_state" text DEFAULT 'complete' NOT NULL,
	"suppressed_count" integer DEFAULT 0 NOT NULL,
	"actor_id" text NOT NULL,
	"actor_label" text,
	"actor_key_id" text,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"playbook_run_id" uuid,
	"playbook_step" integer,
	"playbook_fan_index" integer DEFAULT 0 NOT NULL,
	"retry_of_job_id" uuid,
	"pivots" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "jobs_status_vocab" CHECK ("jobs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "jobs_error_code_vocab" CHECK ("jobs"."error_code" IN ('user_cancelled', 'case_deleted', 'access_revoked', 'cap_timeout', 'cap_failed', 'queue_aborted', 'worker_shutdown', 'stale', 'orphaned', 'preflight_failed')),
	CONSTRAINT "jobs_provenance_state_vocab" CHECK ("jobs"."provenance_state" IN ('complete', 'incomplete'))
);
--> statement-breakpoint
CREATE TABLE "auth"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"open_in_external_tools" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"playbook_id" text NOT NULL,
	"seed" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"outcome" text,
	"actor_id" text NOT NULL,
	"actor_label" text,
	"actor_key_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "playbook_runs_status_vocab" CHECK ("playbook_runs"."status" IN ('running', 'finished', 'cancelled')),
	CONSTRAINT "playbook_runs_outcome_vocab" CHECK ("playbook_runs"."outcome" IN ('succeeded', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "proposal_evidence" (
	"proposal_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "proposal_evidence_proposal_id_evidence_id_pk" PRIMARY KEY("proposal_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"job_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"patch" jsonb NOT NULL,
	"summary" text,
	"suppressed_count" integer DEFAULT 0 NOT NULL,
	"reject_reason" text,
	"left_op_ids" uuid[] DEFAULT '{}' NOT NULL,
	"rejected_op_ids" uuid[] DEFAULT '{}' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_proposal_id" uuid,
	"agent_sourced" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "proposals_status_vocab" CHECK ("proposals"."status" IN ('pending', 'accepted', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "provider_call_outcomes" (
	"call_id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"status" integer,
	"hops" jsonb NOT NULL,
	"response_headers" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"headers_ms" integer,
	"duration_ms" integer,
	"failure_tag" text,
	"failure_reason" text,
	"body_state" text NOT NULL,
	"body_reason" text,
	"body_sha256" text,
	"body_bytes" bigint,
	"blob_key" text,
	"served_from_call_id" uuid,
	"ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_call_outcomes_outcome_vocab" CHECK ("provider_call_outcomes"."outcome" IN ('response', 'failed', 'unfinished', 'served_from')),
	CONSTRAINT "provider_call_outcomes_body_state_vocab" CHECK ("provider_call_outcomes"."body_state" IN ('none', 'stored', 'hashed', 'partial')),
	CONSTRAINT "provider_call_outcomes_body_reason_vocab" CHECK ("provider_call_outcomes"."body_reason" IN ('over_limit', 'over_job_budget', 'hash_only', 'served_from', 'reader_stopped', 'byte_cap', 'read_failed')),
	CONSTRAINT "provider_call_outcomes_body_shape_ck" CHECK (("provider_call_outcomes"."body_state" <> 'none' OR ("provider_call_outcomes"."body_sha256" IS NULL AND "provider_call_outcomes"."body_bytes" IS NULL AND "provider_call_outcomes"."blob_key" IS NULL AND "provider_call_outcomes"."body_reason" IS NULL))
        AND ("provider_call_outcomes"."body_state" NOT IN ('stored', 'hashed', 'partial') OR ("provider_call_outcomes"."body_sha256" IS NOT NULL AND "provider_call_outcomes"."body_bytes" IS NOT NULL))
        AND ("provider_call_outcomes"."body_state" <> 'stored' OR ("provider_call_outcomes"."blob_key" IS NOT NULL AND "provider_call_outcomes"."body_reason" IS NULL))
        AND ("provider_call_outcomes"."body_state" <> 'hashed' OR ("provider_call_outcomes"."blob_key" IS NULL AND "provider_call_outcomes"."body_reason" IS NOT NULL))
        AND ("provider_call_outcomes"."body_state" <> 'partial' OR "provider_call_outcomes"."body_reason" IS NOT NULL)),
	CONSTRAINT "provider_call_outcomes_served_from_ck" CHECK (("provider_call_outcomes"."outcome" = 'served_from') = ("provider_call_outcomes"."served_from_call_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"transport" text NOT NULL,
	"method" text NOT NULL,
	"url_redacted" text NOT NULL,
	"body_kind" text NOT NULL,
	"request_body_state" text NOT NULL,
	"request_body_sha256" text,
	"request_body_bytes" bigint,
	"started_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_calls_job_run_seq_uq" UNIQUE("job_id","run_id","seq"),
	CONSTRAINT "provider_calls_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "provider_calls_transport_vocab" CHECK ("provider_calls"."transport" IN ('http', 'dns', 'tls')),
	CONSTRAINT "provider_calls_body_kind_vocab" CHECK ("provider_calls"."body_kind" IN ('response', 'dns_answer_json', 'tls_peer_chain_der')),
	CONSTRAINT "provider_calls_request_body_state_vocab" CHECK ("provider_calls"."request_body_state" IN ('none', 'hashed', 'unhashable')),
	CONSTRAINT "provider_calls_request_body_hash_ck" CHECK (("provider_calls"."request_body_state" = 'hashed') = ("provider_calls"."request_body_sha256" IS NOT NULL AND "provider_calls"."request_body_bytes" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "questions_status_vocab" CHECK ("questions"."status" IN ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"entity_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'backlog' NOT NULL,
	"priority" text,
	"due_date" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "tasks_status_vocab" CHECK ("tasks"."status" IN ('backlog', 'in_progress', 'blocked', 'done', 'dropped')),
	CONSTRAINT "tasks_priority_vocab" CHECK ("tasks"."priority" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."auth_event" ADD CONSTRAINT "auth_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_cache" ADD CONSTRAINT "cap_cache_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_id_case_id_fk" FOREIGN KEY ("claim_id","case_id") REFERENCES "public"."claims"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_evidence" ADD CONSTRAINT "edge_evidence_edge_id_case_id_fk" FOREIGN KEY ("edge_id","case_id") REFERENCES "public"."edges"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_evidence" ADD CONSTRAINT "edge_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_id_case_id_fk" FOREIGN KEY ("from_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_id_case_id_fk" FOREIGN KEY ("to_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_provider_calls" ADD CONSTRAINT "evidence_provider_calls_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_provider_calls" ADD CONSTRAINT "evidence_provider_calls_call_id_case_id_fk" FOREIGN KEY ("call_id","case_id") REFERENCES "public"."provider_calls"("id","case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_uploads" ADD CONSTRAINT "evidence_uploads_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_suppressions" ADD CONSTRAINT "finding_suppressions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_suppressions" ADD CONSTRAINT "finding_suppressions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_history" ADD CONSTRAINT "graph_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_writes" ADD CONSTRAINT "graph_writes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identifier_evidence" ADD CONSTRAINT "identifier_evidence_identifier_id_case_id_fk" FOREIGN KEY ("identifier_id","case_id") REFERENCES "public"."identifiers"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identifier_evidence" ADD CONSTRAINT "identifier_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_evidence" ADD CONSTRAINT "job_evidence_job_id_case_id_fk" FOREIGN KEY ("job_id","case_id") REFERENCES "public"."jobs"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_evidence" ADD CONSTRAINT "job_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_start_limits" ADD CONSTRAINT "job_start_limits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_start_limits" ADD CONSTRAINT "job_start_limits_key_id_apikey_id_fk" FOREIGN KEY ("key_id") REFERENCES "auth"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_playbook_run_id_playbook_runs_id_fk" FOREIGN KEY ("playbook_run_id") REFERENCES "public"."playbook_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retry_of_job_id_jobs_id_fk" FOREIGN KEY ("retry_of_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_evidence" ADD CONSTRAINT "proposal_evidence_proposal_id_case_id_fk" FOREIGN KEY ("proposal_id","case_id") REFERENCES "public"."proposals"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_evidence" ADD CONSTRAINT "proposal_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_call_outcomes" ADD CONSTRAINT "provider_call_outcomes_call_id_case_id_fk" FOREIGN KEY ("call_id","case_id") REFERENCES "public"."provider_calls"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_job_id_case_id_fk" FOREIGN KEY ("job_id","case_id") REFERENCES "public"."jobs"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "auth"."account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_xid_id_idx" ON "activity" USING btree ("xid","id");--> statement-breakpoint
CREATE INDEX "activity_case_id_id_idx" ON "activity" USING btree ("case_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_org_created_idx" ON "activity" USING btree ("organization_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "activity_org_case_created_idx" ON "activity" USING btree ("organization_id","case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "activity_group_created_idx" ON "activity" USING btree ("group_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "activity"."group_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "auth"."apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "auth"."apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "auth"."apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "auth_event_user_id_idx" ON "auth"."auth_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_event_created_at_idx" ON "auth"."auth_event" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cap_cache_case_cap_input_uidx" ON "cap_cache" USING btree ("case_id","capability_id","input_hash");--> statement-breakpoint
CREATE INDEX "case_deletion_records_case_id_idx" ON "case_deletion_records" USING btree ("case_id","id");--> statement-breakpoint
CREATE INDEX "case_deletion_records_case_xid_idx" ON "case_deletion_records" USING btree ("case_id","xid");--> statement-breakpoint
CREATE INDEX "case_deletion_records_organization_id_idx" ON "case_deletion_records" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_id_organization_uidx" ON "cases" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_organization_id_slug_uidx" ON "cases" USING btree ("organization_id","slug") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_name_idx" ON "cases" USING btree ("organization_id","name","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_created_idx" ON "cases" USING btree ("organization_id","created_at","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_updated_idx" ON "cases" USING btree ("organization_id","updated_at","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_egress_name_idx" ON "cases" USING btree ("organization_id","allowed_egress","name","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_name_trgm_idx" ON "cases" USING gin ("name" gin_trgm_ops) WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_slug_trgm_idx" ON "cases" USING gin ("slug" gin_trgm_ops) WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_description_trgm_idx" ON "cases" USING gin ("description" gin_trgm_ops) WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_at_idx" ON "cases" USING btree ("deleted_at") WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_list_idx" ON "cases" USING btree ("organization_id",coalesce("deleted_at", '1970-01-01T00:00:00.000Z'::timestamptz),"id") WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_name_idx" ON "cases" USING btree ("organization_id","name","id") WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_name_trgm_idx" ON "cases" USING gin ("name" gin_trgm_ops) WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_slug_trgm_idx" ON "cases" USING gin ("slug" gin_trgm_ops) WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_description_trgm_idx" ON "cases" USING gin ("description" gin_trgm_ops) WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "claim_evidence_evidence_id_idx" ON "claim_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "claims_entity_created_idx" ON "claims" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "claims_case_created_idx" ON "claims" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "claims_case_retracted_created_idx" ON "claims" USING btree ("case_id","created_at","id") WHERE "claims"."retracted";--> statement-breakpoint
CREATE INDEX "claims_text_trgm_idx" ON "claims" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "collect_queue_activity_idx" ON "collect_queue" USING btree ("case_id","hidden","activity_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collect_queue_started_idx" ON "collect_queue" USING btree ("case_id","hidden","sort_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collect_queue_state_activity_idx" ON "collect_queue" USING btree ("case_id","state","activity_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collect_queue_entity_activity_idx" ON "collect_queue" USING btree ("case_id","entity_id","activity_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "collect_queue"."entity_id" is not null;--> statement-breakpoint
CREATE INDEX "collect_queue_search_trgm_idx" ON "collect_queue" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "collect_queue_member_row_idx" ON "collect_queue_member" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "collect_queue_member_case_idx" ON "collect_queue_member" USING btree ("case_id","job_id");--> statement-breakpoint
CREATE INDEX "collect_queue_stale_case_idx" ON "collect_queue_stale" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_user_id_name_uidx" ON "credentials" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "edge_evidence_evidence_id_idx" ON "edge_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_natural_uidx" ON "edges" USING btree ("from_id","to_id","predicate");--> statement-breakpoint
CREATE INDEX "edges_to_id_idx" ON "edges" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "edges_case_predicate_idx" ON "edges" USING btree ("case_id","predicate","id");--> statement-breakpoint
CREATE INDEX "edges_case_updated_idx" ON "edges" USING btree ("case_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "edges_notes_trgm_idx" ON "edges" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "entities_case_slug_uidx" ON "entities" USING btree ("case_id","slug");--> statement-breakpoint
CREATE INDEX "entities_case_name_idx" ON "entities" USING btree ("case_id","name","id");--> statement-breakpoint
CREATE INDEX "entities_case_updated_idx" ON "entities" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entities_case_created_idx" ON "entities" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "entities_summary_trgm_idx" ON "entities" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "entities_notes_trgm_idx" ON "entities" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_entity_when_idx" ON "events" USING btree ("entity_id","when","id");--> statement-breakpoint
CREATE INDEX "events_case_when_idx" ON "events" USING btree ("case_id","when","id");--> statement-breakpoint
CREATE INDEX "events_case_created_idx" ON "events" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "events_what_trgm_idx" ON "events" USING gin ("what" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_where_trgm_idx" ON "events" USING gin ("where" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_when_trgm_idx" ON "events" USING gin ("when" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "evidence_case_captured_idx" ON "evidence" USING btree ("case_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "evidence_case_label_idx" ON "evidence" USING btree ("case_id",coalesce("label", ''),"id");--> statement-breakpoint
CREATE INDEX "evidence_case_hidden_captured_idx" ON "evidence" USING btree ("case_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "evidence"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "evidence_entity_captured_idx" ON "evidence" USING btree ("entity_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "evidence_label_trgm_idx" ON "evidence" USING gin ("label" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "evidence_notes_trgm_idx" ON "evidence" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "evidence_source_url_trgm_idx" ON "evidence" USING gin ("source_url" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "evidence_provider_calls_call_id_idx" ON "evidence_provider_calls" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "evidence_provider_calls_case_id_idx" ON "evidence_provider_calls" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_uploads_pending_idx" ON "evidence_uploads" USING btree ("created_at") WHERE "evidence_uploads"."confirmed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "finding_suppressions_proposal_id_idx" ON "finding_suppressions" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finding_suppressions_case_fp_uidx" ON "finding_suppressions" USING btree ("case_id","fingerprint");--> statement-breakpoint
CREATE INDEX "graph_history_case_row_idx" ON "graph_history" USING btree ("case_id","kind","row_id","id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "graph_writes_case_created_idx" ON "graph_writes" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "graph_writes_summary_trgm_idx" ON "graph_writes" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "graph_writes_actor_label_trgm_idx" ON "graph_writes" USING gin ("actor_label" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "graph_writes_case_actor_idem_uidx" ON "graph_writes" USING btree ("case_id","actor_id","idempotency_key") WHERE "graph_writes"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "identifier_evidence_evidence_id_idx" ON "identifier_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identifiers_natural_uidx" ON "identifiers" USING btree ("entity_id","type","platform","value");--> statement-breakpoint
CREATE INDEX "identifiers_case_value_idx" ON "identifiers" USING btree ("case_id","value","id");--> statement-breakpoint
CREATE INDEX "identifiers_case_created_idx" ON "identifiers" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "identifiers_case_updated_idx" ON "identifiers" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "identifiers_entity_value_idx" ON "identifiers" USING btree ("entity_id","value","id");--> statement-breakpoint
CREATE INDEX "identifiers_value_trgm_idx" ON "identifiers" USING gin ("value" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "identifiers_platform_trgm_idx" ON "identifiers" USING gin ("platform" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "identifiers_notes_trgm_idx" ON "identifiers" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "auth"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "auth"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "job_evidence_evidence_id_idx" ON "job_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "job_evidence_case_id_idx" ON "job_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "job_start_counters_window_start_idx" ON "job_start_counters" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "job_start_limits_org_uq" ON "job_start_limits" USING btree ("organization_id") WHERE "job_start_limits"."key_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_start_limits_key_uq" ON "job_start_limits" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "job_start_limits_organization_id_idx" ON "job_start_limits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "jobs_case_updated_idx" ON "jobs" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "jobs_case_created_idx" ON "jobs" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "jobs_capability_id_trgm_idx" ON "jobs" USING gin ("capability_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_result_summary_trgm_idx" ON "jobs" USING gin ("result_summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_error_trgm_idx" ON "jobs" USING gin ("error" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_retry_of_job_id_idx" ON "jobs" USING btree ("retry_of_job_id");--> statement-breakpoint
CREATE INDEX "jobs_playbook_run_updated_idx" ON "jobs" USING btree ("playbook_run_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "jobs_input_evidence_id_idx" ON "jobs" USING btree (public.collect_input_evidence_id("input", 'evidenceId'));--> statement-breakpoint
CREATE INDEX "jobs_input_source_evidence_id_idx" ON "jobs" USING btree (public.collect_input_evidence_id("input", 'sourceEvidenceId'));--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_playbook_run_step_fan_uq" ON "jobs" USING btree ("playbook_run_id","playbook_step","playbook_fan_index") WHERE "jobs"."playbook_run_id" IS NOT NULL AND "jobs"."retry_of_job_id" IS NULL;--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "auth"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "auth"."member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_id_user_id_uidx" ON "auth"."member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_case_id_idx" ON "playbook_runs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "proposal_evidence_evidence_id_idx" ON "proposal_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "proposal_evidence_case_id_idx" ON "proposal_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "proposal_evidence_proposal_position_idx" ON "proposal_evidence" USING btree ("proposal_id","position");--> statement-breakpoint
CREATE INDEX "proposals_case_created_idx" ON "proposals" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "proposals_case_status_created_idx" ON "proposals" USING btree ("case_id","status","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "proposals_summary_trgm_idx" ON "proposals" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "proposals_reject_reason_trgm_idx" ON "proposals" USING gin ("reject_reason" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "proposals_job_id_idx" ON "proposals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "provider_call_outcomes_case_started_idx" ON "provider_call_outcomes" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "provider_calls_case_started_idx" ON "provider_calls" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "questions_entity_created_idx" ON "questions" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "questions_case_created_idx" ON "questions" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "questions_text_trgm_idx" ON "questions" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "questions_resolved_note_trgm_idx" ON "questions" USING gin ("resolved_note" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_active_organization_id_idx" ON "auth"."session" USING btree ("active_organization_id");--> statement-breakpoint
CREATE INDEX "tasks_entity_updated_idx" ON "tasks" USING btree ("entity_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tasks_case_status_position_idx" ON "tasks" USING btree ("case_id","status","position");--> statement-breakpoint
CREATE INDEX "tasks_case_status_updated_idx" ON "tasks" USING btree ("case_id","status","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tasks_case_updated_idx" ON "tasks" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tasks_case_title_idx" ON "tasks" USING btree ("case_id","title","id");--> statement-breakpoint
CREATE INDEX "tasks_case_position_idx" ON "tasks" USING btree ("case_id","position","id");--> statement-breakpoint
CREATE INDEX "tasks_case_open_due_idx" ON "tasks" USING btree ("case_id","due_date","id") WHERE "tasks"."status" in ('backlog', 'in_progress', 'blocked');--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_description_trgm_idx" ON "tasks" USING gin ("description" gin_trgm_ops);
--> statement-breakpoint
-- Hand-written SQL from here on: drizzle does not model it.

-- The one hand edit of the generated part: drizzle adds every foreign key before any index, but
-- this key references the unique index `cases_id_organization_uidx`, so it moved here.
ALTER TABLE "activity" ADD CONSTRAINT "activity_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- `ON DELETE SET NULL (entity_id)` (Postgres 15+) nulls only the entity, never the Case column the
-- composite key shares with it. Drizzle cannot spell the column list.
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_entity_id_case_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ("entity_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_entity_id_case_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ("entity_id") ON UPDATE no action;
--> statement-breakpoint
-- The payload is only a wake-up (about 80 bytes); readers fetch the rows.
-- Postgres queues a NOTIFY issued in a transaction and delivers it at commit,
-- in commit order, and drops it on rollback.
CREATE FUNCTION "activity_notify"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM pg_catalog.pg_notify(
    'watchdog_activity',
    pg_catalog.json_build_object('id', NEW."id", 'caseId', NEW."case_id")::text
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "activity_notify_trg"
AFTER INSERT ON "activity"
FOR EACH ROW EXECUTE FUNCTION "activity_notify"();
--> statement-breakpoint
-- #302: Evidence cited by a Proposal or Job cannot be hard-deleted (the Evidence end of
-- proposal_evidence / job_evidence / evidence_provider_calls is ON DELETE RESTRICT: Evidence is
-- forensic). A Case delete must still remove everything in it, but Postgres checks RESTRICT when
-- the cascaded Evidence delete finishes, before the cascade has reached the Job or Proposal and its
-- link rows. So the Case's link rows go first, in a BEFORE DELETE trigger on cases. SECURITY
-- DEFINER (as the owner, like graph_history's triggers): the application role may not DELETE an
-- audit table such as evidence_provider_calls, yet a Case delete must still clear it.
-- A Case purge clears its projection rows before the cascade, as it clears its link rows. It takes
-- no Case lock: a purge needs a tombstone committed a retention period earlier, and every flush
-- skips a tombstoned Case, so no flush writes these rows while a purge deletes them.
CREATE FUNCTION public."evidence_links_before_case_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  DELETE FROM public."collect_queue_member" WHERE "case_id" = OLD."id";
  DELETE FROM public."collect_queue" WHERE "case_id" = OLD."id";
  DELETE FROM public."collect_queue_stale" WHERE "case_id" = OLD."id";
  DELETE FROM public."collect_queue_case" WHERE "case_id" = OLD."id";
  DELETE FROM public."proposal_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."job_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."evidence_provider_calls" WHERE "case_id" = OLD."id";
  RETURN OLD;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER "evidence_links_before_case_delete_trg"
  BEFORE DELETE ON "cases"
  FOR EACH ROW EXECUTE FUNCTION "evidence_links_before_case_delete"();
--> statement-breakpoint
-- Graph history and attribution live in the database (#303). Row triggers on the seven Graph
-- tables (entities, edges, identifiers, claims, events, questions, tasks) write `graph_history`
-- themselves, so no write path can skip it: an application bug, a cascade, a seed or a hand-written
-- statement is recorded the same way. Who and through which door come from transaction-local
-- settings that core sets once per write transaction (`set_config('watchdog.actor_id' |
-- 'watchdog.actor_label' | 'watchdog.actor_key_id' | 'watchdog.channel', ..., true)`); a write with
-- no setting is channel `system` with no actor. created_by / updated_by are filled from the same
-- settings by a BEFORE trigger. `actor_key_id` is the API key's own id (no foreign key: deleting a
-- key keeps the trail).

CREATE FUNCTION "public"."graph_history_setting"(p_name text) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT nullif(pg_catalog.current_setting(p_name, true), '') $$;
--> statement-breakpoint
-- The Evidence ids linked to a Claim, Identifier or Edge, sorted, as a JSON array.
CREATE FUNCTION "public"."graph_history_evidence_ids"(p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_ids jsonb;
BEGIN
  IF p_kind = 'claim' THEN
    SELECT coalesce(jsonb_agg(l."evidence_id" ORDER BY l."evidence_id"), '[]'::jsonb) INTO v_ids
    FROM "public"."claim_evidence" l WHERE l."claim_id" = p_id;
  ELSIF p_kind = 'identifier' THEN
    SELECT coalesce(jsonb_agg(l."evidence_id" ORDER BY l."evidence_id"), '[]'::jsonb) INTO v_ids
    FROM "public"."identifier_evidence" l WHERE l."identifier_id" = p_id;
  ELSIF p_kind = 'edge' THEN
    SELECT coalesce(jsonb_agg(l."evidence_id" ORDER BY l."evidence_id"), '[]'::jsonb) INTO v_ids
    FROM "public"."edge_evidence" l WHERE l."edge_id" = p_id;
  END IF;
  RETURN v_ids;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."graph_history_ids_minus"(p_a jsonb, p_b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(e ORDER BY e), '[]'::jsonb)
  FROM jsonb_array_elements_text(p_a) e
  WHERE e NOT IN (SELECT jsonb_array_elements_text(p_b))
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."graph_history_ids_union"(p_a jsonb, p_b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(e ORDER BY e), '[]'::jsonb)
  FROM (SELECT jsonb_array_elements_text(p_a) AS e UNION SELECT jsonb_array_elements_text(p_b)) u
$$;
--> statement-breakpoint
-- A row as history stores it: to_jsonb plus `evidence_ids` for a Claim, Identifier or Edge.
CREATE FUNCTION "public"."graph_history_snapshot"(p_kind text, p_row jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_row IS NULL THEN NULL
    WHEN p_kind IN ('claim', 'identifier', 'edge') THEN
      p_row || jsonb_build_object('evidence_ids', "public"."graph_history_evidence_ids"(p_kind, (p_row->>'id')::uuid))
    ELSE p_row
  END
$$;
--> statement-breakpoint
-- The one writer of graph_history. Only the owner may call it (the SECURITY
-- DEFINER trigger functions below run as the owner). Writes nothing for a Case
-- that is gone: a Case delete cascades through the Graph tables and the history
-- goes with the Case, so recording those cascaded changes would only trip its
-- foreign key.
CREATE FUNCTION "public"."graph_history_append"(
  p_case uuid, p_kind text, p_row uuid, p_op text, p_before jsonb, p_after jsonb
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."cases" c WHERE c."id" = p_case) THEN
    RETURN;
  END IF;
  INSERT INTO "public"."graph_history" ("case_id", "kind", "row_id", "op", "channel", "actor_id", "actor_label", "actor_key_id", "before", "after")
  VALUES (
    p_case, p_kind, p_row, p_op,
    CASE WHEN "public"."graph_history_setting"('watchdog.channel') IN ('dossier', 'triage_accept', 'agent_write')
      THEN "public"."graph_history_setting"('watchdog.channel') ELSE 'system' END,
    "public"."graph_history_setting"('watchdog.actor_id'),
    "public"."graph_history_setting"('watchdog.actor_label'),
    "public"."graph_history_setting"('watchdog.actor_key_id'),
    p_before, p_after
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."graph_history_append"(uuid, text, uuid, text, jsonb, jsonb) FROM PUBLIC;
--> statement-breakpoint
-- AFTER INSERT / UPDATE / DELETE on a Graph table; TG_ARGV[0] is the row kind.
-- An UPDATE that changes nothing but updated_at / updated_by / version records nothing.
CREATE FUNCTION "public"."graph_history_row"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_op text;
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_case uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'create';
    v_after := to_jsonb(NEW);
    v_row := v_after;
  ELSIF TG_OP = 'UPDATE' THEN
    v_op := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_row := v_after;
    IF (v_before - 'updated_at' - 'updated_by' - 'version') = (v_after - 'updated_at' - 'updated_by' - 'version') THEN
      RETURN NULL;
    END IF;
    -- a Claim that turns retracted is a retract, not an edit
    IF (v_before->>'retracted') IS DISTINCT FROM 'true' AND (v_after->>'retracted') = 'true' THEN
      v_op := 'retract';
    END IF;
  ELSE
    v_op := 'delete';
    v_before := to_jsonb(OLD);
    v_row := v_before;
  END IF;
  v_case := (v_row->>'case_id')::uuid;
  IF v_case IS NULL AND v_op = 'delete' THEN
    RETURN NULL;
  END IF;
  IF v_case IS NULL THEN
    RAISE EXCEPTION 'graph_history: no Case for % %', v_kind, v_row->>'id';
  END IF;
  PERFORM "public"."graph_history_append"(
    v_case, v_kind, (v_row->>'id')::uuid, v_op,
    "public"."graph_history_snapshot"(v_kind, v_before),
    "public"."graph_history_snapshot"(v_kind, v_after)
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- A change to the Evidence a Claim, Identifier or Edge cites is an update of that
-- row: one history row per parent per statement (a replace is a delete and an
-- insert, so two). TG_ARGV: kind, parent table, parent column in the link table.
CREATE FUNCTION "public"."graph_history_link_changed"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_table text := TG_ARGV[1];
  v_col text := TG_ARGV[2];
  v_parent uuid;
  v_old jsonb;
  v_new jsonb;
  v_delta jsonb;
  v_now jsonb;
  v_before jsonb;
  v_case uuid;
BEGIN
  FOR v_parent IN EXECUTE format('SELECT DISTINCT %I FROM changed', v_col) LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM "public".%I t WHERE t."id" = $1', v_table) INTO v_old USING v_parent;
    CONTINUE WHEN v_old IS NULL;
    -- Touch the parent so its last editor is the one who changed its Evidence (the
    -- row trigger records nothing for a touch: only updated_at / updated_by moved).
    EXECUTE format('UPDATE "public".%I SET "updated_at" = now() WHERE "id" = $1', v_table) USING v_parent;
    EXECUTE format('SELECT to_jsonb(t) FROM "public".%I t WHERE t."id" = $1', v_table) INTO v_new USING v_parent;
    EXECUTE format('SELECT coalesce(jsonb_agg(evidence_id ORDER BY evidence_id), ''[]''::jsonb) FROM changed WHERE %I = $1', v_col)
      INTO v_delta USING v_parent;
    v_now := "public"."graph_history_evidence_ids"(v_kind, v_parent);
    IF TG_OP = 'INSERT' THEN
      v_before := "public"."graph_history_ids_minus"(v_now, v_delta);
    ELSE
      v_before := "public"."graph_history_ids_union"(v_now, v_delta);
    END IF;
    v_case := (v_new->>'case_id')::uuid;
    CONTINUE WHEN v_case IS NULL;
    PERFORM "public"."graph_history_append"(
      v_case, v_kind, v_parent, 'update',
      v_old || jsonb_build_object('evidence_ids', v_before),
      v_new || jsonb_build_object('evidence_ids', v_now)
    );
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- created_by / updated_by from the same settings, so there is one source.
-- A statement that sets an author to a different value than the row holds keeps what it set;
-- every other write, including an UPDATE that leaves updated_by as it was, takes the actor from
-- the settings, NULL when there is none.
CREATE FUNCTION "public"."graph_attribution"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."created_by" := coalesce(NEW."created_by", "public"."graph_history_setting"('watchdog.actor_id'));
    NEW."updated_by" := coalesce(NEW."updated_by", "public"."graph_history_setting"('watchdog.actor_id'));
  ELSIF NEW."updated_by" IS NOT DISTINCT FROM OLD."updated_by" THEN
    NEW."updated_by" := "public"."graph_history_setting"('watchdog.actor_id');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('entities', 'entity'),
      ('edges', 'edge'),
      ('identifiers', 'identifier'),
      ('claims', 'claim'),
      ('events', 'event'),
      ('questions', 'question'),
      ('tasks', 'task')
    ) AS v(tbl, kind)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "graph_attribution_trg" BEFORE INSERT OR UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_attribution"()',
      t.tbl);
    -- Named to sort before the foreign-key triggers, so a deleted Claim's snapshot
    -- still sees the Evidence links the cascade is about to remove.
    EXECUTE format(
      'CREATE TRIGGER "AA_graph_history_row" AFTER INSERT OR UPDATE OR DELETE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_history_row"(%L)',
      t.tbl, t.kind);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_ins_trg" AFTER INSERT ON "public"."claim_evidence"
REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('claim', 'claims', 'claim_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_del_trg" AFTER DELETE ON "public"."claim_evidence"
REFERENCING OLD TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('claim', 'claims', 'claim_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_ins_trg" AFTER INSERT ON "public"."identifier_evidence"
REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('identifier', 'identifiers', 'identifier_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_del_trg" AFTER DELETE ON "public"."identifier_evidence"
REFERENCING OLD TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('identifier', 'identifiers', 'identifier_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_ins_trg" AFTER INSERT ON "public"."edge_evidence"
REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('edge', 'edges', 'edge_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_del_trg" AFTER DELETE ON "public"."edge_evidence"
REFERENCING OLD TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('edge', 'edges', 'edge_id');
--> statement-breakpoint
-- graph_history is append-only. UPDATE is refused; DELETE is refused while the
-- Case exists (the Case's own ON DELETE CASCADE is the only way rows leave, so a
-- purge takes the history with it); TRUNCATE is refused unless the operator opts
-- in for the transaction (`SET LOCAL watchdog.allow_history_truncate = 'on'`:
-- `just wipe` and the test resets do).
CREATE FUNCTION "public"."graph_history_guard"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'graph_history is append-only: UPDATE is not allowed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "public"."cases" c WHERE c."id" = OLD."case_id") THEN
    RAISE EXCEPTION 'graph_history is append-only: rows go only with their Case'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "graph_history_guard_trg"
BEFORE UPDATE OR DELETE ON "public"."graph_history"
FOR EACH ROW EXECUTE FUNCTION "public"."graph_history_guard"();
--> statement-breakpoint
CREATE FUNCTION "public"."graph_history_no_truncate"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF "public"."graph_history_setting"('watchdog.allow_history_truncate') = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'graph_history is append-only: TRUNCATE is not allowed'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "graph_history_no_truncate_trg"
BEFORE TRUNCATE ON "public"."graph_history"
FOR EACH STATEMENT EXECUTE FUNCTION "public"."graph_history_no_truncate"();
--> statement-breakpoint
-- Optimistic concurrency on Graph edits (#307). `version` is a per-row integer: 1 on insert, +1 on
-- every UPDATE of the six Graph tables a person or agent edits (`tasks` are case work items and keep
-- last-write-wins). A caller reads the version with the row and sends it back; the repo's UPDATE adds
-- `AND version = $n`. This BEFORE UPDATE trigger owns the increment (never the repo, never a
-- caller): it also bumps on a cascade or the Evidence-link touch of `graph_history_link_changed`.
CREATE FUNCTION "public"."graph_version_bump"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities', 'edges', 'identifiers', 'claims', 'events', 'questions']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "graph_version_trg" BEFORE UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_version_bump"()',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The application role may not write the Graph without saying who is writing (#352). When
-- `current_user` is `watchdog_app` and `watchdog.channel` is unset or empty, an INSERT, UPDATE or
-- DELETE on a Graph table, on a link table that records history, or a DELETE on `cases` (which
-- cascades into the Graph) raises SQLSTATE WD001. The owner role is never refused and is recorded as
-- `system`; cascades are never refused either (they run as the owner of the referencing table). The
-- role is matched by name, as `APP_ROLE` names it (a test keeps the two equal): on a database
-- without that role the trigger is a no-op.
CREATE FUNCTION "public"."graph_require_history_context"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user = 'watchdog_app'
     AND "public"."graph_history_setting"('watchdog.channel') IS NULL THEN
    RAISE EXCEPTION 'graph write on "%" refused: no history context is set for this transaction (watchdog.channel is unset)', TG_TABLE_NAME
      USING ERRCODE = 'WD001',
            HINT = 'Call setHistoryContextEffect(tx, ctx) in @watchdog/core as the first statement of the write transaction (setGraphHistoryContext in @watchdog/db); in tests, seed through the seed* helpers or wrap the write in withSystemHistoryContext from @watchdog/test-db.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entities', 'edges', 'identifiers', 'claims', 'events', 'questions', 'tasks',
    'claim_evidence', 'identifier_evidence', 'edge_evidence'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "graph_history_context_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_require_history_context"()',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
-- A Case delete cascades through every Graph table (and `graph_history` goes with it), so the
-- application role may delete one only with a history context too.
CREATE TRIGGER "graph_history_context_guard_trg" BEFORE DELETE ON "public"."cases"
FOR EACH ROW EXECUTE FUNCTION "public"."graph_require_history_context"();
--> statement-breakpoint
-- the database enforces the Case lifecycle for the application role.
--
-- A Case is deleted in two steps (a tombstone, then a purge) and every step leaves a row in the
-- permanent `case_deletion_records` log. Core writes that row in the same transaction, before the
-- change. This BEFORE trigger on `cases` makes the database refuse a change that has no matching
-- record, the way the Graph write guard above refuses a Graph write that has no history context. When
-- `current_user` is the application role (`watchdog_app`, `packages/db/src/app-role.ts`):
--
--   DELETE   only a tombstoned Case (`deleted_at` set), and only with a `purged` record of the
--            current transaction;
--   UPDATE   a change to `deleted_at`, `deleted_by`, `purge_after`, `purge_started_at` or
--            `purge_error` needs a record of this transaction for the Case: `deleted` when it
--            becomes deleted, `restored` when it becomes live again, `purge_started` when the
--            purge begins, `purge_failed` when a new failure is stored, and at least one of them
--            for any other change of those columns. A restore is refused once the purge began, and
--            a begun purge cannot be taken back.
--
-- A record belongs to the transaction when its `xid` (default `pg_current_xact_id()`) equals the
-- current transaction's id, so it must be written first, in the same transaction, and a record
-- left over from an earlier transaction proves nothing. Refusals raise SQLSTATE WD002.
--
-- The owner role is never refused: migrations, `just wipe`, the owner-run test reset and manual
-- maintenance may edit Cases without a record (they leave none; that is the documented path).
-- Cascades from other tables never reach `cases`. Organization deletion runs as the application
-- role and goes through the same tombstone and purge records (`deleteOrganizationCasesEffect`).
-- The role is matched by name, as for the Graph write guard (a test keeps it equal to
-- `APP_ROLE`), and the trigger is a no-op on a database without that role.
CREATE FUNCTION "public"."cases_lifecycle_guard"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  has_event text;
BEGIN
  IF current_user <> 'watchdog_app' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'delete of case % refused: it is not deleted (tombstone it first)', OLD.id
        USING ERRCODE = 'WD002',
              HINT = 'A Case is hard-deleted only by a purge of a tombstone: deleteCaseEffect, then purgeCaseEffect in @watchdog/core.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "public"."case_deletion_records" r
      WHERE r.case_id = OLD.id AND r.event = 'purged' AND r.xid = pg_current_xact_id()
    ) THEN
      RAISE EXCEPTION 'delete of case % refused: no purged deletion record in this transaction', OLD.id
        USING ERRCODE = 'WD002',
              HINT = 'Insert the purged record (caseDeletionRecordsRepo.append) before the delete, in the same transaction.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND NEW.deleted_by IS NOT DISTINCT FROM OLD.deleted_by
     AND NEW.purge_after IS NOT DISTINCT FROM OLD.purge_after
     AND NEW.purge_started_at IS NOT DISTINCT FROM OLD.purge_started_at
     AND NEW.purge_error IS NOT DISTINCT FROM OLD.purge_error THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND OLD.purge_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'restore of case % refused: its purge has begun', OLD.id
      USING ERRCODE = 'WD002',
            HINT = 'A Case whose purge began can only be purged.';
  END IF;
  IF OLD.purge_started_at IS NOT NULL AND NEW.purge_started_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'case % refused: a begun purge cannot be taken back', OLD.id
      USING ERRCODE = 'WD002';
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    has_event := 'deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    has_event := 'restored';
  ELSIF OLD.purge_started_at IS NULL AND NEW.purge_started_at IS NOT NULL THEN
    has_event := 'purge_started';
  ELSIF NEW.purge_error IS NOT NULL AND NEW.purge_error IS DISTINCT FROM OLD.purge_error THEN
    has_event := 'purge_failed';
  ELSE
    has_event := NULL;
  END IF;

  IF has_event IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "public"."case_deletion_records" r
      WHERE r.case_id = OLD.id AND r.event = has_event AND r.xid = pg_current_xact_id()
    ) THEN
      RAISE EXCEPTION 'change of case % refused: no % deletion record in this transaction', OLD.id, has_event
        USING ERRCODE = 'WD002',
              HINT = 'Insert the record (caseDeletionRecordsRepo.append) before the change, in the same transaction.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM "public"."case_deletion_records" r
    WHERE r.case_id = OLD.id AND r.xid = pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION 'change of case % refused: no deletion record in this transaction', OLD.id
      USING ERRCODE = 'WD002',
            HINT = 'Insert the record (caseDeletionRecordsRepo.append) before the change, in the same transaction.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "cases_lifecycle_guard_trg" BEFORE UPDATE OR DELETE ON "public"."cases"
FOR EACH ROW EXECUTE FUNCTION "public"."cases_lifecycle_guard"();
--> statement-breakpoint
-- Custom migration (#574): the functions and triggers that keep Collect's queue (`collect_queue`,
-- `collect_queue_member`, created above) equal to its sources. Same conventions as the functions
-- above: every function pins
-- `search_path = pg_catalog, pg_temp` and qualifies `public.`; the ones that write the projection
-- are SECURITY DEFINER, so the application role only reads it (`app-role.ts`).
--
-- How a write reaches the projection:
--   1. A row trigger on `jobs`, `evidence`, `job_evidence`, `playbook_runs` or `cases` records the
--      key it changed (`collect_queue_mark`) in a temporary table of the session, and inserts one
--      marker row for the transaction into `collect_queue_tx` (ON CONFLICT DO NOTHING).
--   2. The marker's insert queues the transaction's one deferred event (`collect_queue_flush_trg`).
--      At commit, `collect_queue_flush` takes each touched Case's advisory lock in ascending key
--      order and recomputes the rows those keys reach (`collect_queue_sync`).
--   3. A Case whose flush fails rolls back only its own subtransaction and is logged in
--      `collect_queue_stale`; the writer still commits. The worker's reconcile tick rebuilds it
--      (`collect_queue_find_drift`, `collect_queue_rebuild`).
--
-- The flush reads the source tables without locking them and writes only projection rows of a
-- Case whose lock it holds, so it cannot close a lock cycle with a writer's own row locks
-- (`settleJobInTx`, `casesRepo.lockById`). Incremental sync and full rebuild call the same rule
-- functions (`collect_queue_memberships`, `collect_queue_compute`); `collect_queue_diff` compares
-- the stored rows with a recomputation, without writing.
--
-- A change to a rule (the Cap list, attachment, state, activity, search text) ships as a new
-- migration with `CREATE OR REPLACE` (ending with the backfill
-- `SELECT public.collect_queue_rebuild(c.id) FROM public.cases c WHERE c.deleted_at IS NULL ORDER BY c.id;`
-- once there are rows to rebuild), with the TypeScript reference (`@watchdog/domain/schemas/testing`, `collectQueueReference`) changed to match.

-- Process and enrich Caps link to Evidence through their input (`isProcessCapability`,
-- `URL_ENRICH_CAPABILITY_ID`); a playbook step does too, decided by the caller.
CREATE FUNCTION public.collect_input_linked_cap(p_capability_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT p_capability_id IN ('evidence.harvest', 'evidence.extract.ai', 'network.url.enrich')
$$;
--> statement-breakpoint
-- The searchable text of a Job's input: its string values under `JOB_INPUT_HINT_KEYS`, in that order.
CREATE FUNCTION public.collect_input_text(p_input jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(pg_catalog.string_agg(v.t, ' ' ORDER BY k.o), '')
  FROM pg_catalog.unnest(
    ARRAY['host', 'domain', 'ip', 'url', 'email', 'hash', 'handle', 'target', 'query', 'name']
  ) WITH ORDINALITY AS k(key, o)
  CROSS JOIN LATERAL (
    SELECT p_input ->> k.key AS t WHERE pg_catalog.jsonb_typeof(p_input -> k.key) = 'string'
  ) v
  WHERE v.t <> ''
$$;
--> statement-breakpoint
-- The second key of a Case's advisory lock (the first is the constant 1464091473, "WDCQ", so it
-- cannot meet the single-bigint locks of the migrator, the vault, bootstrap or the reconcile tick).
-- Two Cases that share a key only serialize more; locks are always taken in ascending key order.
CREATE FUNCTION public.collect_queue_lock_key(p_case uuid) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT pg_catalog.hashtext(p_case::text)
$$;
--> statement-breakpoint
-- The Evidence rows each Job could attach to (R1 of the design):
--   more than one landed row: none;
--   one landed row: it, plus the input ids when the Job links by input;
--   none landed: the input ids when the Job links by input.
-- Visibility (same Case, not hidden) is the caller's join.
CREATE FUNCTION public.collect_queue_cand(p_case uuid, p_jobs uuid[])
RETURNS TABLE (job_id uuid, evidence_id uuid)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH j AS (
    SELECT jb.id, jb.input,
           ARRAY(SELECT je.evidence_id FROM public.job_evidence je
                  WHERE je.job_id = jb.id ORDER BY je.position) AS landed,
           (public.collect_input_linked_cap(jb.capability_id) OR jb.playbook_run_id IS NOT NULL) AS linkable
    FROM public.jobs jb
    WHERE jb.case_id = p_case AND jb.id = ANY (p_jobs)
  )
  SELECT j.id, j.landed[1] FROM j WHERE pg_catalog.cardinality(j.landed) = 1
  UNION
  SELECT j.id, v.e
  FROM j CROSS JOIN LATERAL (
    VALUES (public.collect_input_evidence_id(j.input, 'evidenceId')),
           (public.collect_input_evidence_id(j.input, 'sourceEvidenceId'))
  ) AS v(e)
  WHERE j.linkable AND pg_catalog.cardinality(j.landed) <= 1 AND v.e IS NOT NULL
$$;
--> statement-breakpoint
-- Which row each Job belongs to: every visible Evidence row it could attach to, else its run
-- (`playbook_run_id`), else a row of its own.
CREATE FUNCTION public.collect_queue_memberships(p_case uuid, p_jobs uuid[])
RETURNS TABLE (job_id uuid, row_id uuid)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH att AS (
    SELECT DISTINCT c.job_id, c.evidence_id AS row_id
    FROM public.collect_queue_cand(p_case, p_jobs) c
    JOIN public.evidence e
      ON e.id = c.evidence_id AND e.case_id = p_case AND e.deleted_at IS NULL
  )
  SELECT att.job_id, att.row_id FROM att
  UNION ALL
  SELECT jb.id, coalesce(jb.playbook_run_id, jb.id)
  FROM public.jobs jb
  WHERE jb.case_id = p_case AND jb.id = ANY (p_jobs)
    AND NOT EXISTS (SELECT 1 FROM att WHERE att.job_id = jb.id)
$$;
--> statement-breakpoint
-- The rows `p_ids` should hold, given member pairs (`p_mjobs[i]` is in row `p_mrows[i]`). An id
-- with no row (a run or Job row left with no member) is absent from the result.
--   Evidence row: started and active at `captured_at`; `hidden`, `unprocessed` or `landed`.
--   Run or Job row: started at the run's or the Job's creation; active at the latest member
--     transition (created, started, finished) or hide of Evidence the member could attach to;
--     state by priority over the members no other member of the row retries.
--   capability_ids: the members' Caps and their runs' playbooks, sorted (C collation).
--   search_text: Evidence label, notes, URL (500 each); each Cap or playbook id raw and humanized;
--     per member by (created_at, id): result summary, error, interpret error, input text (200
--     each); joined by spaces, cut at 4,000 characters.
CREATE FUNCTION public.collect_queue_compute(p_case uuid, p_ids uuid[], p_mjobs uuid[], p_mrows uuid[])
RETURNS TABLE (
  id uuid, kind text, sort_at timestamptz, activity_at timestamptz, state text, entity_id uuid,
  capability_ids text[], search_text text
)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH ev AS MATERIALIZED (
    SELECT e.id, e.captured_at, e.processed_at, e.deleted_at, e.entity_id, e.label, e.notes, e.source_url
    FROM public.evidence e
    WHERE e.case_id = p_case AND e.id = ANY (p_ids)
  ),
  mj AS MATERIALIZED (
    SELECT p.row_id, j.id, j.capability_id, j.status, j.retry_of_job_id, j.playbook_run_id,
           j.created_at, GREATEST(j.created_at, j.started_at, j.finished_at) AS t,
           j.result_summary, j.error, j.interpret_error, j.input, r.playbook_id,
           EXISTS (SELECT 1 FROM ev WHERE ev.id = p.row_id) AS on_evidence
    FROM ROWS FROM (pg_catalog.unnest(p_mjobs), pg_catalog.unnest(p_mrows)) AS p(job_id, row_id)
    JOIN public.jobs j ON j.id = p.job_id AND j.case_id = p_case
    LEFT JOIN public.playbook_runs r ON r.id = j.playbook_run_id
    WHERE p.row_id = ANY (p_ids)
  ),
  hid AS (
    SELECT c.job_id, max(e.deleted_at) AS h
    FROM public.collect_queue_cand(
      p_case, ARRAY(SELECT DISTINCT mj.id FROM mj WHERE NOT mj.on_evidence)
    ) c
    JOIN public.evidence e
      ON e.id = c.evidence_id AND e.case_id = p_case AND e.deleted_at IS NOT NULL
    GROUP BY c.job_id
  ),
  grp AS (
    SELECT mj.row_id AS id,
           CASE WHEN bool_or(mj.playbook_run_id = mj.row_id) THEN 'run' ELSE 'job' END AS kind,
           min(mj.created_at) AS first_created,
           max(GREATEST(mj.t, hid.h)) AS activity_at
    FROM mj LEFT JOIN hid ON hid.job_id = mj.id
    WHERE NOT mj.on_evidence
    GROUP BY mj.row_id
  ),
  st AS (
    SELECT m.row_id,
           CASE WHEN bool_or(m.status = 'running') THEN 'running'
                WHEN bool_or(m.status = 'queued') THEN 'queued'
                WHEN bool_or(m.status = 'failed') THEN 'failed'
                WHEN bool_or(m.status = 'cancelled') THEN 'cancelled'
                ELSE 'landed' END AS state
    FROM mj m
    LEFT JOIN mj r ON r.row_id = m.row_id AND r.retry_of_job_id = m.id
    WHERE r.id IS NULL AND NOT m.on_evidence
    GROUP BY m.row_id
  ),
  caps AS (
    SELECT DISTINCT mj.row_id, x.cap
    FROM mj CROSS JOIN LATERAL (VALUES (mj.capability_id), (mj.playbook_id)) AS x(cap)
    WHERE x.cap IS NOT NULL
  ),
  caps_agg AS (
    SELECT caps.row_id, array_agg(caps.cap ORDER BY caps.cap COLLATE "C") AS capability_ids
    FROM caps GROUP BY caps.row_id
  ),
  parts AS (
    SELECT ev.id AS row_id, 0 AS o1, 0::bigint AS o2, x.o3, pg_catalog.left(x.part, 500) AS part
    FROM ev CROSS JOIN LATERAL (VALUES (0, ev.label), (1, ev.notes), (2, ev.source_url)) AS x(o3, part)
    UNION ALL
    SELECT c.row_id, 1, dense_rank() OVER (PARTITION BY c.row_id ORDER BY c.cap COLLATE "C"), x.o3, x.part
    FROM caps c CROSS JOIN LATERAL (
      VALUES (0, c.cap), (1, pg_catalog.translate(c.cap, '.-_', '   '))
    ) AS x(o3, part)
    UNION ALL
    SELECT mj.row_id, 2, dense_rank() OVER (PARTITION BY mj.row_id ORDER BY mj.created_at, mj.id),
           x.o3, pg_catalog.left(x.part, 200)
    FROM mj CROSS JOIN LATERAL (
      VALUES (0, mj.result_summary), (1, mj.error), (2, mj.interpret_error),
             (3, public.collect_input_text(mj.input))
    ) AS x(o3, part)
  ),
  texts AS (
    SELECT parts.row_id,
           pg_catalog.left(pg_catalog.string_agg(parts.part, ' ' ORDER BY parts.o1, parts.o2, parts.o3), 4000) AS search_text
    FROM parts
    WHERE parts.part IS NOT NULL AND parts.part <> ''
    GROUP BY parts.row_id
  )
  SELECT ev.id, 'evidence'::text, ev.captured_at, ev.captured_at,
         CASE WHEN ev.deleted_at IS NOT NULL THEN 'hidden'
              WHEN ev.processed_at IS NULL THEN 'unprocessed'
              ELSE 'landed' END,
         ev.entity_id, coalesce(ca.capability_ids, '{}'), coalesce(tx.search_text, '')
  FROM ev
  LEFT JOIN caps_agg ca ON ca.row_id = ev.id
  LEFT JOIN texts tx ON tx.row_id = ev.id
  UNION ALL
  SELECT g.id, g.kind, coalesce(r.created_at, g.first_created), g.activity_at,
         coalesce(st.state, 'landed'), NULL::uuid,
         coalesce(ca.capability_ids, '{}'), coalesce(tx.search_text, '')
  FROM grp g
  LEFT JOIN st ON st.row_id = g.id
  LEFT JOIN public.playbook_runs r ON g.kind = 'run' AND r.id = g.id
  LEFT JOIN caps_agg ca ON ca.row_id = g.id
  LEFT JOIN texts tx ON tx.row_id = g.id
$$;
--> statement-breakpoint
-- Bring a Case's rows up to date for the keys of one transaction (or all of it with p_rebuild).
-- The caller holds the Case's advisory lock. A Case that is gone or tombstoned is left as it is:
-- nothing reads a tombstoned Case, a restore rebuilds it, and a purge clears it.
CREATE FUNCTION public.collect_queue_sync(p_case uuid, p_jobs uuid[], p_evidence uuid[], p_rebuild boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_jobs uuid[];
  v_rows uuid[];
  v_new_jobs uuid[];
  v_new_rows uuid[];
  v_mjobs uuid[];
  v_mrows uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.id = p_case AND c.deleted_at IS NULL) THEN
    RETURN;
  END IF;

  -- 1. The Jobs whose membership may have changed, and 2. the rows they were in before.
  IF p_rebuild THEN
    SELECT coalesce(array_agg(j.id), '{}') INTO v_jobs FROM public.jobs j WHERE j.case_id = p_case;
    SELECT coalesce(array_agg(x.id), '{}') INTO v_rows FROM (
      SELECT q.id FROM public.collect_queue q WHERE q.case_id = p_case
      UNION
      SELECT e.id FROM public.evidence e WHERE e.case_id = p_case
    ) x;
  ELSE
    SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_jobs FROM (
      SELECT pg_catalog.unnest(p_jobs) AS id
      UNION ALL
      SELECT je.job_id FROM public.job_evidence je
       WHERE je.evidence_id = ANY (p_evidence) AND je.case_id = p_case
      UNION ALL
      SELECT j.id FROM public.jobs j
       WHERE public.collect_input_evidence_id(j.input, 'evidenceId') = ANY (p_evidence) AND j.case_id = p_case
      UNION ALL
      SELECT j.id FROM public.jobs j
       WHERE public.collect_input_evidence_id(j.input, 'sourceEvidenceId') = ANY (p_evidence) AND j.case_id = p_case
    ) x;
    SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_rows FROM (
      SELECT m.row_id AS id FROM public.collect_queue_member m
       WHERE m.job_id = ANY (v_jobs) AND m.case_id = p_case
      UNION ALL
      SELECT pg_catalog.unnest(p_evidence)
    ) x;
  END IF;

  -- 3. Membership by difference: unchanged pairs are not written.
  SELECT coalesce(array_agg(n.job_id), '{}'), coalesce(array_agg(n.row_id), '{}')
    INTO v_new_jobs, v_new_rows
    FROM public.collect_queue_memberships(p_case, v_jobs) n;
  IF p_rebuild THEN
    DELETE FROM public.collect_queue_member m
     WHERE m.case_id = p_case
       AND NOT EXISTS (
         SELECT 1 FROM ROWS FROM (pg_catalog.unnest(v_new_jobs), pg_catalog.unnest(v_new_rows)) AS n(job_id, row_id)
          WHERE n.job_id = m.job_id AND n.row_id = m.row_id);
  ELSE
    DELETE FROM public.collect_queue_member m
     WHERE m.case_id = p_case AND m.job_id = ANY (v_jobs)
       AND NOT EXISTS (
         SELECT 1 FROM ROWS FROM (pg_catalog.unnest(v_new_jobs), pg_catalog.unnest(v_new_rows)) AS n(job_id, row_id)
          WHERE n.job_id = m.job_id AND n.row_id = m.row_id);
  END IF;
  INSERT INTO public.collect_queue_member (job_id, row_id, case_id)
  SELECT n.job_id, n.row_id, p_case
    FROM ROWS FROM (pg_catalog.unnest(v_new_jobs), pg_catalog.unnest(v_new_rows)) AS n(job_id, row_id)
   ORDER BY n.job_id, n.row_id
  ON CONFLICT DO NOTHING;

  -- 4. Rows: every row a touched Job left or joined, recomputed from its members.
  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_rows FROM (
    SELECT pg_catalog.unnest(v_rows) AS id
    UNION ALL
    SELECT pg_catalog.unnest(v_new_rows)
  ) x;
  SELECT coalesce(array_agg(m.job_id), '{}'), coalesce(array_agg(m.row_id), '{}')
    INTO v_mjobs, v_mrows
    FROM public.collect_queue_member m
   WHERE m.row_id = ANY (v_rows) AND m.case_id = p_case;

  WITH c AS MATERIALIZED (
    SELECT * FROM public.collect_queue_compute(p_case, v_rows, v_mjobs, v_mrows)
  ),
  gone AS (
    DELETE FROM public.collect_queue q
     WHERE q.case_id = p_case AND q.id = ANY (v_rows)
       AND NOT EXISTS (SELECT 1 FROM c WHERE c.id = q.id)
  )
  INSERT INTO public.collect_queue AS q
    (id, case_id, kind, sort_at, activity_at, state, entity_id, capability_ids, search_text)
  SELECT c.id, p_case, c.kind, c.sort_at, c.activity_at, c.state, c.entity_id, c.capability_ids, c.search_text
    FROM c ORDER BY c.id
  ON CONFLICT (id) DO UPDATE SET
    case_id = EXCLUDED.case_id, kind = EXCLUDED.kind, sort_at = EXCLUDED.sort_at,
    activity_at = EXCLUDED.activity_at, state = EXCLUDED.state, entity_id = EXCLUDED.entity_id,
    capability_ids = EXCLUDED.capability_ids, search_text = EXCLUDED.search_text
  WHERE (q.case_id, q.kind, q.sort_at, q.activity_at, q.state, q.entity_id, q.capability_ids, q.search_text)
        IS DISTINCT FROM
        (EXCLUDED.case_id, EXCLUDED.kind, EXCLUDED.sort_at, EXCLUDED.activity_at, EXCLUDED.state,
         EXCLUDED.entity_id, EXCLUDED.capability_ids, EXCLUDED.search_text);
END
$$;
--> statement-breakpoint
-- Recompute a whole Case under its lock (backfill, drift repair, a restore). Clears the Case's
-- stale marks that were visible before the recomputation started: a mark that commits later
-- stays for the next tick.
CREATE FUNCTION public.collect_queue_rebuild(p_case uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_stale bigint[];
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(1464091473, public.collect_queue_lock_key(p_case));
  SELECT coalesce(array_agg(s.id), '{}') INTO v_stale
    FROM public.collect_queue_stale s WHERE s.case_id = p_case;
  PERFORM public.collect_queue_sync(p_case, '{}', '{}', true);
  DELETE FROM public.collect_queue_stale s WHERE s.id = ANY (v_stale);
END
$$;
--> statement-breakpoint
-- Where the stored rows and members of a live Case differ from a recomputation. Writes nothing.
CREATE FUNCTION public.collect_queue_diff(p_case uuid)
RETURNS TABLE (diff_kind text, diff_id uuid, diff_detail text)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_jobs uuid[];
  v_ids uuid[];
  v_mjobs uuid[];
  v_mrows uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.id = p_case AND c.deleted_at IS NULL) THEN
    RETURN;
  END IF;
  SELECT coalesce(array_agg(j.id), '{}') INTO v_jobs FROM public.jobs j WHERE j.case_id = p_case;
  SELECT coalesce(array_agg(n.job_id), '{}'), coalesce(array_agg(n.row_id), '{}')
    INTO v_mjobs, v_mrows
    FROM public.collect_queue_memberships(p_case, v_jobs) n;
  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_ids FROM (
    SELECT e.id FROM public.evidence e WHERE e.case_id = p_case
    UNION ALL
    SELECT pg_catalog.unnest(v_mrows)
  ) x;
  RETURN QUERY
  WITH c AS (
    SELECT * FROM public.collect_queue_compute(p_case, v_ids, v_mjobs, v_mrows)
  ),
  l AS (
    SELECT q.id, q.kind, q.sort_at, q.activity_at, q.state, q.entity_id, q.capability_ids, q.search_text
      FROM public.collect_queue q WHERE q.case_id = p_case
  )
  SELECT 'row'::text, coalesce(l.id, c.id),
         pg_catalog.format('stored %s, computed %s', pg_catalog.to_jsonb(l), pg_catalog.to_jsonb(c))
    FROM c FULL JOIN l ON l.id = c.id
   WHERE (l.id, l.kind, l.sort_at, l.activity_at, l.state, l.entity_id, l.capability_ids, l.search_text)
         IS DISTINCT FROM
         (c.id, c.kind, c.sort_at, c.activity_at, c.state, c.entity_id, c.capability_ids, c.search_text)
  UNION ALL
  SELECT 'member'::text, coalesce(lm.row_id, cm.row_id),
         pg_catalog.format('job %s: stored %s, computed %s', coalesce(lm.job_id, cm.job_id),
                           lm.job_id IS NOT NULL, cm.job_id IS NOT NULL)
    FROM (SELECT m.job_id, m.row_id FROM public.collect_queue_member m WHERE m.case_id = p_case) lm
    FULL JOIN ROWS FROM (pg_catalog.unnest(v_mjobs), pg_catalog.unnest(v_mrows)) AS cm(job_id, row_id)
      ON cm.job_id = lm.job_id AND cm.row_id = lm.row_id
   WHERE lm.job_id IS NULL OR cm.job_id IS NULL;
END
$$;
--> statement-breakpoint
-- Record one changed key for this transaction's flush. The marker row makes exactly one deferred
-- event per transaction: ON CONFLICT DO NOTHING queues no second one, and a rolled-back savepoint
-- takes its marker and its keys with it, so the next key inserts the marker again. The keys table
-- is created on first use in the session, by this function, so the owner owns it.
CREATE FUNCTION public.collect_queue_mark(p_case uuid, p_job uuid, p_evidence uuid, p_rebuild boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF pg_catalog.to_regclass('pg_temp.collect_queue_keys') IS NULL THEN
    CREATE TEMP TABLE collect_queue_keys (
      case_id uuid NOT NULL, job_id uuid, evidence_id uuid, rebuild boolean NOT NULL
    );
  END IF;
  -- A session may pre-create this name (TEMPORARY is granted to PUBLIC) with its own trigger, which
  -- would then run with this function's owner rights. Only an attack causes it, so raise.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
     WHERE c.oid = pg_catalog.to_regclass('pg_temp.collect_queue_keys')
       AND c.relkind = 'r' AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
  ) THEN
    RAISE EXCEPTION 'collect_queue: pg_temp.collect_queue_keys is not owned by %', current_user;
  END IF;
  INSERT INTO public.collect_queue_tx (xid) VALUES (pg_catalog.pg_current_xact_id())
  ON CONFLICT DO NOTHING;
  INSERT INTO pg_temp.collect_queue_keys (case_id, job_id, evidence_id, rebuild)
  VALUES (p_case, p_job, p_evidence, p_rebuild);
END
$$;
--> statement-breakpoint
-- Recompute the rows the transaction's keys reach. The deferred trigger's body, and callable
-- (a test whose transaction rolls back calls it directly). Never raises: a Case that fails, a
-- lock timeout and a deadlock abort included, rolls back its own subtransaction (releasing its
-- lock) and is logged in `collect_queue_stale`, and the writer commits.
CREATE FUNCTION public.collect_queue_flush() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  k record;
  v_lock_timeout text;
  v_read_committed boolean;
BEGIN
  IF pg_catalog.to_regclass('pg_temp.collect_queue_keys') IS NULL THEN
    RETURN;
  END IF;
  -- A session may pre-create this name (TEMPORARY is granted to PUBLIC) with its own trigger, which
  -- would then run with this function's owner rights. Only an attack causes it, so raise.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
     WHERE c.oid = pg_catalog.to_regclass('pg_temp.collect_queue_keys')
       AND c.relkind = 'r' AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
  ) THEN
    RAISE EXCEPTION 'collect_queue: pg_temp.collect_queue_keys is not owned by %', current_user;
  END IF;
  DELETE FROM public.collect_queue_tx WHERE xid = pg_catalog.pg_current_xact_id_if_assigned();
  v_lock_timeout := pg_catalog.current_setting('lock_timeout');
  -- Under REPEATABLE READ the recomputation cannot see a rival's commit made while it waited for
  -- the lock, so such a flush also marks its Case for the tick (nothing in the app uses it).
  v_read_committed := pg_catalog.current_setting('transaction_isolation') = 'read committed';
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  FOR k IN
    SELECT q.case_id,
           coalesce(array_agg(DISTINCT q.job_id) FILTER (WHERE q.job_id IS NOT NULL), '{}') AS jobs,
           coalesce(array_agg(DISTINCT q.evidence_id) FILTER (WHERE q.evidence_id IS NOT NULL), '{}') AS evidence,
           bool_or(q.rebuild) AS rebuild
      FROM pg_temp.collect_queue_keys q
     GROUP BY q.case_id
     ORDER BY public.collect_queue_lock_key(q.case_id), q.case_id
  LOOP
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(1464091473, public.collect_queue_lock_key(k.case_id));
      PERFORM public.collect_queue_sync(k.case_id, k.jobs, k.evidence, k.rebuild);
      IF NOT v_read_committed THEN
        INSERT INTO public.collect_queue_stale (case_id, at, error)
        VALUES (k.case_id, pg_catalog.clock_timestamp(), 'flushed outside READ COMMITTED');
      END IF;
    EXCEPTION WHEN OTHERS OR query_canceled THEN
      BEGIN
        INSERT INTO public.collect_queue_stale (case_id, at, error)
        VALUES (k.case_id, pg_catalog.clock_timestamp(), SQLERRM);
      EXCEPTION WHEN OTHERS OR query_canceled THEN
        RAISE WARNING 'collect_queue: the flush of case % failed and could not be recorded: %', k.case_id, SQLERRM;
      END;
    END;
  END LOOP;
  -- A long-lived session reuses its keys table; deleted rows are pruned but never vacuumed, so a
  -- table that has grown is truncated (a new file) instead of emptied in place.
  IF pg_catalog.pg_relation_size('pg_temp.collect_queue_keys'::regclass) > 1048576 THEN
    TRUNCATE pg_temp.collect_queue_keys;
  ELSE
    DELETE FROM pg_temp.collect_queue_keys;
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', v_lock_timeout, true);
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.collect_queue_flush_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM public.collect_queue_flush();
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- Row triggers: record the old and the new key of the row (an id or Case change records both).
CREATE FUNCTION public.collect_queue_jobs_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.collect_queue_mark(NEW.case_id, NEW.id, NULL, false);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.collect_queue_mark(OLD.case_id, OLD.id, NULL, false);
  ELSE
    PERFORM public.collect_queue_mark(OLD.case_id, OLD.id, NULL, false);
    IF (NEW.case_id, NEW.id) IS DISTINCT FROM (OLD.case_id, OLD.id) THEN
      PERFORM public.collect_queue_mark(NEW.case_id, NEW.id, NULL, false);
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.collect_queue_evidence_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.collect_queue_mark(NEW.case_id, NULL, NEW.id, false);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.collect_queue_mark(OLD.case_id, NULL, OLD.id, false);
  ELSE
    PERFORM public.collect_queue_mark(OLD.case_id, NULL, OLD.id, false);
    IF (NEW.case_id, NEW.id) IS DISTINCT FROM (OLD.case_id, OLD.id) THEN
      PERFORM public.collect_queue_mark(NEW.case_id, NULL, NEW.id, false);
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.collect_queue_job_evidence_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.collect_queue_mark(OLD.case_id, OLD.job_id, OLD.evidence_id, false);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.collect_queue_mark(NEW.case_id, NEW.job_id, NEW.evidence_id, false);
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- A run's playbook id or start time feeds its row; neither changes in the app, but a direct write
-- (a test, a repair) still reaches the projection.
CREATE FUNCTION public.collect_queue_runs_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM public.collect_queue_mark(j.case_id, j.id, NULL, false)
     FROM public.jobs j WHERE j.playbook_run_id = NEW.id;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    PERFORM public.collect_queue_mark(j.case_id, j.id, NULL, false)
       FROM public.jobs j WHERE j.playbook_run_id = OLD.id;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- A restored Case was frozen while tombstoned: rebuild it.
CREATE FUNCTION public.collect_queue_case_restored() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM public.collect_queue_mark(NEW.id, NULL, NULL, true);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "collect_queue_jobs_ins_del_trg"
  AFTER INSERT OR DELETE ON public."jobs"
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_jobs_changed();
--> statement-breakpoint
-- A log flush changes only `logs` and `updated_at`, so it does not fire.
CREATE TRIGGER "collect_queue_jobs_upd_trg"
  AFTER UPDATE ON public."jobs"
  FOR EACH ROW
  WHEN ((OLD.id, OLD.case_id, OLD.status, OLD.input, OLD.capability_id, OLD.playbook_run_id,
         OLD.retry_of_job_id, OLD.result_summary, OLD.error, OLD.interpret_error, OLD.created_at,
         OLD.started_at, OLD.finished_at)
        IS DISTINCT FROM
        (NEW.id, NEW.case_id, NEW.status, NEW.input, NEW.capability_id, NEW.playbook_run_id,
         NEW.retry_of_job_id, NEW.result_summary, NEW.error, NEW.interpret_error, NEW.created_at,
         NEW.started_at, NEW.finished_at))
  EXECUTE FUNCTION public.collect_queue_jobs_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_evidence_ins_del_trg"
  AFTER INSERT OR DELETE ON public."evidence"
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_evidence_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_evidence_upd_trg"
  AFTER UPDATE ON public."evidence"
  FOR EACH ROW
  WHEN ((OLD.id, OLD.case_id, OLD.deleted_at, OLD.processed_at, OLD.entity_id, OLD.label, OLD.notes,
         OLD.source_url, OLD.captured_at)
        IS DISTINCT FROM
        (NEW.id, NEW.case_id, NEW.deleted_at, NEW.processed_at, NEW.entity_id, NEW.label, NEW.notes,
         NEW.source_url, NEW.captured_at))
  EXECUTE FUNCTION public.collect_queue_evidence_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_job_evidence_trg"
  AFTER INSERT OR UPDATE OR DELETE ON public."job_evidence"
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_job_evidence_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_runs_upd_trg"
  AFTER UPDATE ON public."playbook_runs"
  FOR EACH ROW
  WHEN ((OLD.id, OLD.playbook_id, OLD.created_at) IS DISTINCT FROM (NEW.id, NEW.playbook_id, NEW.created_at))
  EXECUTE FUNCTION public.collect_queue_runs_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_case_restored_trg"
  AFTER UPDATE ON public."cases"
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.collect_queue_case_restored();
--> statement-breakpoint
ALTER TABLE public."collect_queue_tx" SET UNLOGGED;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "collect_queue_flush_trg"
  AFTER INSERT ON public."collect_queue_tx"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_flush_trg();
--> statement-breakpoint
-- The reconcile tick's check: the live Cases to rebuild, with why. A Case is drifted when a flush
-- of it failed (`stale`, the `p_limit` oldest; the rest wait for the next tick); when its counts disagree (`fingerprint`: Evidence rows against Evidence,
-- member Jobs against Jobs, or a run or Job row with no member), checked for the `p_limit` live
-- Cases counted longest ago; or when a full comparison finds a difference (`diff`), for the one
-- live Case compared longest ago. A Case may be returned more than once.
CREATE FUNCTION public.collect_queue_find_drift(p_limit integer)
RETURNS TABLE (drift_case_id uuid, drift_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  c record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_diff uuid;
BEGIN
  DELETE FROM public.collect_queue_stale s
   WHERE NOT EXISTS (SELECT 1 FROM public.cases x WHERE x.id = s.case_id AND x.deleted_at IS NULL);
  RETURN QUERY SELECT s.case_id, 'stale'::text FROM public.collect_queue_stale s
                GROUP BY s.case_id ORDER BY min(s.at), s.case_id LIMIT p_limit;

  FOR c IN
    SELECT x.id FROM public.cases x
      LEFT JOIN public.collect_queue_case b ON b.case_id = x.id
     WHERE x.deleted_at IS NULL
     ORDER BY b.checked_at NULLS FIRST, x.id
     LIMIT p_limit
  LOOP
    IF (SELECT count(*) FROM public.evidence e WHERE e.case_id = c.id)
         <> (SELECT count(*) FROM public.collect_queue q WHERE q.case_id = c.id AND q.kind = 'evidence')
       OR (SELECT count(*) FROM public.jobs j WHERE j.case_id = c.id)
         <> (SELECT count(DISTINCT m.job_id) FROM public.collect_queue_member m WHERE m.case_id = c.id)
       OR EXISTS (
         SELECT 1 FROM public.collect_queue q
          WHERE q.case_id = c.id AND q.kind <> 'evidence'
            AND NOT EXISTS (SELECT 1 FROM public.collect_queue_member m WHERE m.row_id = q.id))
    THEN
      drift_case_id := c.id;
      drift_reason := 'fingerprint';
      RETURN NEXT;
    END IF;
    INSERT INTO public.collect_queue_case (case_id, checked_at) VALUES (c.id, v_now)
    ON CONFLICT (case_id) DO UPDATE SET checked_at = EXCLUDED.checked_at;
  END LOOP;

  SELECT x.id INTO v_diff FROM public.cases x
    LEFT JOIN public.collect_queue_case b ON b.case_id = x.id
   WHERE x.deleted_at IS NULL
   ORDER BY b.diffed_at NULLS FIRST, x.id
   LIMIT 1;
  IF v_diff IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.collect_queue_diff(v_diff)) THEN
      drift_case_id := v_diff;
      drift_reason := 'diff';
      RETURN NEXT;
    END IF;
    INSERT INTO public.collect_queue_case (case_id, diffed_at) VALUES (v_diff, v_now)
    ON CONFLICT (case_id) DO UPDATE SET diffed_at = EXCLUDED.diffed_at;
  END IF;
END
$$;
--> statement-breakpoint
-- Internal: only triggers and the flush call these.
REVOKE ALL ON FUNCTION public.collect_queue_mark(uuid, uuid, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.collect_queue_sync(uuid, uuid[], uuid[], boolean) FROM PUBLIC;
--> statement-breakpoint
-- Collect's queue (#574): the callable SECURITY DEFINER functions write the projection and its
-- bookkeeping with the owner's rights, so only the application role may run them. A new function
-- is executable by PUBLIC, which let any login (watchdog_readonly too, after `SET TRANSACTION
-- READ WRITE`) rebuild a Case's queue or clear the stale log. `applyAppRoleGrants` grants EXECUTE
-- back to the application role.
REVOKE ALL ON FUNCTION public.collect_queue_flush() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.collect_queue_rebuild(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.collect_queue_find_drift(integer) FROM PUBLIC;
--> statement-breakpoint
-- Postgres owns `updated_at`: a BEFORE UPDATE trigger on every `public` table that has the column
-- sets it to `now()`, so a raw statement, a database function, another trigger or a migration can
-- never leave it stale (it used to be an app-side Drizzle `$onUpdateFn`). A statement that sets the
-- column itself wins (an explicit value differs from the old one): a seed or test backdating a row
-- keeps its value, and nothing in the application does it. The `auth` schema is Better Auth's and
-- is not touched.
CREATE FUNCTION "public"."touch_updated_at"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."updated_at" IS NOT DISTINCT FROM OLD."updated_at" THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Only a trigger calls it; nobody needs EXECUTE (the trigger is created by this owner).
REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM PUBLIC;
--> statement-breakpoint
-- Every BASE TABLE in `public` with an `updated_at` column (every table exists by now). A table
-- added later attaches the trigger in its own migration; the classification test fails a table
-- that forgot.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "touch_updated_at_trg" BEFORE UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"()',
      t);
  END LOOP;
END $$;
