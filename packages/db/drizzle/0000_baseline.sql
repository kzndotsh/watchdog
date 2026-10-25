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
	CONSTRAINT "activity_kind_vocab" CHECK ("activity"."kind" IN ('task', 'job', 'playbook_run', 'proposal', 'evidence', 'entity', 'edge', 'claim', 'identifier', 'event', 'question', 'case', 'handoff')),
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
	"handoff" jsonb,
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
	"external_ai_handoff" boolean DEFAULT true NOT NULL,
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
	"finished_at" timestamp with time zone,
	CONSTRAINT "playbook_runs_status_vocab" CHECK ("playbook_runs"."status" IN ('running', 'finished', 'cancelled')),
	CONSTRAINT "playbook_runs_outcome_vocab" CHECK ("playbook_runs"."outcome" IN ('succeeded', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "proposal_evidence" (
	"proposal_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
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
CREATE INDEX "activity_created_at_id_idx" ON "activity" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "auth"."apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "auth"."apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "auth"."apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "auth_event_user_id_idx" ON "auth"."auth_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_event_created_at_idx" ON "auth"."auth_event" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cap_cache_case_cap_input_uidx" ON "cap_cache" USING btree ("case_id","capability_id","input_hash");--> statement-breakpoint
CREATE INDEX "case_deletion_records_case_id_idx" ON "case_deletion_records" USING btree ("case_id","id");--> statement-breakpoint
CREATE INDEX "case_deletion_records_case_xid_idx" ON "case_deletion_records" USING btree ("case_id","xid");--> statement-breakpoint
CREATE INDEX "case_deletion_records_organization_id_idx" ON "case_deletion_records" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_organization_id_slug_uidx" ON "cases" USING btree ("organization_id","slug") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_name_idx" ON "cases" USING btree ("organization_id","name","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_deleted_at_idx" ON "cases" USING btree ("deleted_at") WHERE "cases"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "claim_evidence_evidence_id_idx" ON "claim_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "claims_entity_created_idx" ON "claims" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_user_id_name_uidx" ON "credentials" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "edge_evidence_evidence_id_idx" ON "edge_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edges_natural_uidx" ON "edges" USING btree ("from_id","to_id","predicate");--> statement-breakpoint
CREATE INDEX "edges_to_id_idx" ON "edges" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "edges_case_predicate_idx" ON "edges" USING btree ("case_id","predicate","id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_case_slug_uidx" ON "entities" USING btree ("case_id","slug");--> statement-breakpoint
CREATE INDEX "entities_case_name_idx" ON "entities" USING btree ("case_id","name","id");--> statement-breakpoint
CREATE INDEX "events_entity_when_idx" ON "events" USING btree ("entity_id","when","id");--> statement-breakpoint
CREATE INDEX "evidence_case_captured_idx" ON "evidence" USING btree ("case_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "evidence_entity_id_idx" ON "evidence" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "evidence_provider_calls_call_id_idx" ON "evidence_provider_calls" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "evidence_provider_calls_case_id_idx" ON "evidence_provider_calls" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_uploads_pending_idx" ON "evidence_uploads" USING btree ("created_at") WHERE "evidence_uploads"."confirmed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "finding_suppressions_proposal_id_idx" ON "finding_suppressions" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finding_suppressions_case_fp_uidx" ON "finding_suppressions" USING btree ("case_id","fingerprint");--> statement-breakpoint
CREATE INDEX "graph_history_case_row_idx" ON "graph_history" USING btree ("case_id","kind","row_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "graph_writes_case_created_idx" ON "graph_writes" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "graph_writes_case_actor_idem_uidx" ON "graph_writes" USING btree ("case_id","actor_id","idempotency_key") WHERE "graph_writes"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "identifier_evidence_evidence_id_idx" ON "identifier_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identifiers_natural_uidx" ON "identifiers" USING btree ("entity_id","type","platform","value");--> statement-breakpoint
CREATE INDEX "identifiers_entity_type_value_idx" ON "identifiers" USING btree ("entity_id","type","value","id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "auth"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "auth"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "job_evidence_evidence_id_idx" ON "job_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "job_evidence_case_id_idx" ON "job_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "job_start_counters_window_start_idx" ON "job_start_counters" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "job_start_limits_org_uq" ON "job_start_limits" USING btree ("organization_id") WHERE "job_start_limits"."key_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_start_limits_key_uq" ON "job_start_limits" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "job_start_limits_organization_id_idx" ON "job_start_limits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "jobs_case_updated_idx" ON "jobs" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "jobs_retry_of_job_id_idx" ON "jobs" USING btree ("retry_of_job_id");--> statement-breakpoint
CREATE INDEX "jobs_playbook_run_id_idx" ON "jobs" USING btree ("playbook_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_playbook_run_step_fan_uq" ON "jobs" USING btree ("playbook_run_id","playbook_step","playbook_fan_index") WHERE "jobs"."playbook_run_id" IS NOT NULL AND "jobs"."retry_of_job_id" IS NULL;--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "auth"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "auth"."member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_id_user_id_uidx" ON "auth"."member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_case_id_idx" ON "playbook_runs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "proposal_evidence_evidence_id_idx" ON "proposal_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "proposal_evidence_case_id_idx" ON "proposal_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "proposals_case_created_idx" ON "proposals" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "proposals_job_id_idx" ON "proposals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "provider_call_outcomes_case_started_idx" ON "provider_call_outcomes" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "provider_calls_case_started_idx" ON "provider_calls" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "questions_entity_created_idx" ON "questions" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_active_organization_id_idx" ON "auth"."session" USING btree ("active_organization_id");--> statement-breakpoint
CREATE INDEX "tasks_entity_id_idx" ON "tasks" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "tasks_case_status_position_idx" ON "tasks" USING btree ("case_id","status","position");--> statement-breakpoint
CREATE INDEX "tasks_case_position_idx" ON "tasks" USING btree ("case_id","position","created_at","id");