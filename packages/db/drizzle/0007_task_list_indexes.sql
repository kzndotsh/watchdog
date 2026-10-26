DROP INDEX "tasks_entity_id_idx";--> statement-breakpoint
DROP INDEX "tasks_case_position_idx";--> statement-breakpoint
CREATE INDEX "tasks_entity_updated_idx" ON "tasks" USING btree ("entity_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tasks_case_status_updated_idx" ON "tasks" USING btree ("case_id","status","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tasks_case_updated_idx" ON "tasks" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tasks_case_title_idx" ON "tasks" USING btree ("case_id","title","id");--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_description_trgm_idx" ON "tasks" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_case_position_idx" ON "tasks" USING btree ("case_id","position","id");