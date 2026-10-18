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
	CONSTRAINT "case_deletion_records_event_vocab" CHECK ("case_deletion_records"."event" IN ('deleted', 'restored', 'purged'))
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "purge_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "purge_error" text;--> statement-breakpoint
CREATE INDEX "case_deletion_records_case_id_idx" ON "case_deletion_records" USING btree ("case_id","id");--> statement-breakpoint
CREATE INDEX "case_deletion_records_organization_id_idx" ON "case_deletion_records" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "cases_deleted_at_idx" ON "cases" USING btree ("deleted_at") WHERE "cases"."deleted_at" IS NOT NULL;