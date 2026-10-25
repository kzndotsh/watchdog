CREATE TABLE "evidence_provider_calls" (
	"evidence_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_provider_calls_evidence_id_call_id_pk" PRIMARY KEY("evidence_id","call_id")
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
ALTER TABLE "jobs" ADD COLUMN "cache_source_job_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "provenance_state" text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_provider_calls" ADD CONSTRAINT "evidence_provider_calls_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_provider_calls" ADD CONSTRAINT "evidence_provider_calls_call_id_case_id_fk" FOREIGN KEY ("call_id","case_id") REFERENCES "public"."provider_calls"("id","case_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_call_outcomes" ADD CONSTRAINT "provider_call_outcomes_call_id_case_id_fk" FOREIGN KEY ("call_id","case_id") REFERENCES "public"."provider_calls"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_job_id_case_id_fk" FOREIGN KEY ("job_id","case_id") REFERENCES "public"."jobs"("id","case_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_provider_calls_call_id_idx" ON "evidence_provider_calls" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "evidence_provider_calls_case_id_idx" ON "evidence_provider_calls" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "provider_call_outcomes_case_started_idx" ON "provider_call_outcomes" USING btree ("case_id","started_at");--> statement-breakpoint
CREATE INDEX "provider_calls_case_started_idx" ON "provider_calls" USING btree ("case_id","started_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_provenance_state_vocab" CHECK ("jobs"."provenance_state" IN ('complete', 'incomplete'));--> statement-breakpoint
-- Hand edit (the snapshot is unchanged: triggers are not in drizzle's snapshot). The Case delete
-- trigger of migration 0027 now also clears evidence_provider_calls, and runs SECURITY DEFINER
-- (as the owner, like graph_history's triggers): the application role may not DELETE an audit
-- table, so it could not clear that link itself, yet a Case delete must still remove everything
-- in it. The function pins its search_path and qualifies its tables.
CREATE OR REPLACE FUNCTION public."evidence_links_before_case_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  DELETE FROM public."proposal_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."job_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."evidence_provider_calls" WHERE "case_id" = OLD."id";
  RETURN OLD;
END
$fn$;