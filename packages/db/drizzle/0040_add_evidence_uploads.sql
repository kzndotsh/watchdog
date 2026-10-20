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
ALTER TABLE "evidence_uploads" ADD CONSTRAINT "evidence_uploads_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_uploads_pending_idx" ON "evidence_uploads" USING btree ("created_at") WHERE "evidence_uploads"."confirmed_at" IS NULL;