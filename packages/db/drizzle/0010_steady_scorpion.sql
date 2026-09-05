ALTER TABLE "activity_events" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "actor_label" text;--> statement-breakpoint
ALTER TABLE "graph_writes" ADD COLUMN "actor_label" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "actor_label" text;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD COLUMN "actor_label" text;