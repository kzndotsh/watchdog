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
CREATE INDEX "collect_queue_activity_idx" ON "collect_queue" USING btree ("case_id","hidden","activity_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collect_queue_started_idx" ON "collect_queue" USING btree ("case_id","hidden","sort_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collect_queue_state_activity_idx" ON "collect_queue" USING btree ("case_id","state","activity_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "collect_queue_search_trgm_idx" ON "collect_queue" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "collect_queue_member_row_idx" ON "collect_queue_member" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "collect_queue_member_case_idx" ON "collect_queue_member" USING btree ("case_id","job_id");--> statement-breakpoint
CREATE INDEX "collect_queue_stale_case_idx" ON "collect_queue_stale" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "jobs_input_evidence_id_idx" ON "jobs" USING btree (public.collect_input_evidence_id("input", 'evidenceId'));--> statement-breakpoint
CREATE INDEX "jobs_input_source_evidence_id_idx" ON "jobs" USING btree (public.collect_input_evidence_id("input", 'sourceEvidenceId'));