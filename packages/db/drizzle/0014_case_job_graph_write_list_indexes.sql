DROP INDEX "jobs_playbook_run_id_idx";--> statement-breakpoint
CREATE INDEX "cases_organization_created_idx" ON "cases" USING btree ("organization_id","created_at","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_updated_idx" ON "cases" USING btree ("organization_id","updated_at","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_egress_name_idx" ON "cases" USING btree ("organization_id","allowed_egress","name","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_name_trgm_idx" ON "cases" USING gin ("name" gin_trgm_ops) WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_slug_trgm_idx" ON "cases" USING gin ("slug" gin_trgm_ops) WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_description_trgm_idx" ON "cases" USING gin ("description" gin_trgm_ops) WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "graph_writes_summary_trgm_idx" ON "graph_writes" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "graph_writes_actor_label_trgm_idx" ON "graph_writes" USING gin ("actor_label" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_case_created_idx" ON "jobs" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "jobs_capability_id_trgm_idx" ON "jobs" USING gin ("capability_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_result_summary_trgm_idx" ON "jobs" USING gin ("result_summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_error_trgm_idx" ON "jobs" USING gin ("error" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_playbook_run_updated_idx" ON "jobs" USING btree ("playbook_run_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);