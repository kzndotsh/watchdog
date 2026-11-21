CREATE TABLE "changesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"actor_key_id" text,
	"proposal_id" uuid,
	"idempotency_key" text,
	"summary" text,
	"confidence" text,
	"patch" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changesets_id_case_id_uq" UNIQUE("id","case_id"),
	CONSTRAINT "changesets_channel_vocab" CHECK ("changesets"."channel" IN ('dossier', 'triage_accept', 'agent_write', 'system')),
	CONSTRAINT "changesets_confidence_vocab" CHECK ("changesets"."confidence" IN ('unverified', 'possible', 'confirmed')),
	CONSTRAINT "changesets_agent_write_shape" CHECK ("changesets"."channel" <> 'agent_write' OR ("changesets"."confidence" IS NOT NULL AND "changesets"."patch" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "graph_writes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "graph_writes" CASCADE;--> statement-breakpoint
ALTER TABLE "graph_history" ADD COLUMN "changeset_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_proposal_id_case_id_fk" FOREIGN KEY ("proposal_id","case_id") REFERENCES "public"."proposals"("id","case_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changesets_case_channel_created_idx" ON "changesets" USING btree ("case_id","channel","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "changesets_proposal_idx" ON "changesets" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "changesets_summary_trgm_idx" ON "changesets" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "changesets_actor_label_trgm_idx" ON "changesets" USING gin ("actor_label" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "changesets_case_actor_idem_uidx" ON "changesets" USING btree ("case_id","actor_id","idempotency_key") WHERE "changesets"."idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_history" ADD CONSTRAINT "graph_history_changeset_id_case_id_fk" FOREIGN KEY ("changeset_id","case_id") REFERENCES "public"."changesets"("id","case_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graph_history_changeset_idx" ON "graph_history" USING btree ("changeset_id");