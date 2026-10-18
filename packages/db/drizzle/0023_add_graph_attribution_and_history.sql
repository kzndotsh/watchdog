CREATE TABLE "graph_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "graph_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"row_id" uuid NOT NULL,
	"op" text NOT NULL,
	"channel" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_history_op_shape" CHECK (("graph_history"."op" = 'create' AND "graph_history"."before" IS NULL AND "graph_history"."after" IS NOT NULL)
        OR ("graph_history"."op" = 'delete' AND "graph_history"."before" IS NOT NULL AND "graph_history"."after" IS NULL)
        OR ("graph_history"."op" IN ('update', 'retract') AND "graph_history"."before" IS NOT NULL AND "graph_history"."after" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "identifiers" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "identifiers" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "graph_history" ADD CONSTRAINT "graph_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graph_history_case_row_idx" ON "graph_history" USING btree ("case_id","kind","row_id","id" DESC NULLS LAST);