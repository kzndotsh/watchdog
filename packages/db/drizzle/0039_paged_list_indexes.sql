DROP INDEX "claims_entity_id_idx";--> statement-breakpoint
DROP INDEX "events_entity_id_idx";--> statement-breakpoint
DROP INDEX "evidence_case_id_idx";--> statement-breakpoint
DROP INDEX "graph_writes_case_id_idx";--> statement-breakpoint
DROP INDEX "jobs_case_id_idx";--> statement-breakpoint
DROP INDEX "proposals_case_id_idx";--> statement-breakpoint
DROP INDEX "questions_entity_id_idx";--> statement-breakpoint
CREATE INDEX "cases_organization_name_idx" ON "cases" USING btree ("organization_id","name","id") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "claims_entity_created_idx" ON "claims" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "edges_case_predicate_idx" ON "edges" USING btree ("case_id","predicate","id");--> statement-breakpoint
CREATE INDEX "entities_case_name_idx" ON "entities" USING btree ("case_id","name","id");--> statement-breakpoint
CREATE INDEX "events_entity_when_idx" ON "events" USING btree ("entity_id","when","id");--> statement-breakpoint
CREATE INDEX "evidence_case_captured_idx" ON "evidence" USING btree ("case_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "graph_writes_case_created_idx" ON "graph_writes" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "identifiers_entity_type_value_idx" ON "identifiers" USING btree ("entity_id","type","value","id");--> statement-breakpoint
CREATE INDEX "jobs_case_updated_idx" ON "jobs" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "proposals_case_created_idx" ON "proposals" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "questions_entity_created_idx" ON "questions" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "tasks_case_position_idx" ON "tasks" USING btree ("case_id","position","created_at","id");