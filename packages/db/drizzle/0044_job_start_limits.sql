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
ALTER TABLE "job_start_limits" ADD CONSTRAINT "job_start_limits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_start_limits" ADD CONSTRAINT "job_start_limits_key_id_apikey_id_fk" FOREIGN KEY ("key_id") REFERENCES "auth"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_start_counters_window_start_idx" ON "job_start_counters" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "job_start_limits_org_uq" ON "job_start_limits" USING btree ("organization_id") WHERE "job_start_limits"."key_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_start_limits_key_uq" ON "job_start_limits" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "job_start_limits_organization_id_idx" ON "job_start_limits" USING btree ("organization_id");