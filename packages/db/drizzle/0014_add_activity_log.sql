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
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_label_len" CHECK (char_length("activity"."label") <= 200)
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_xid_id_idx" ON "activity" USING btree ("xid","id");--> statement-breakpoint
CREATE INDEX "activity_case_id_id_idx" ON "activity" USING btree ("case_id","id" DESC NULLS LAST);