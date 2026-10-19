DROP INDEX "claims_entity_id_idx";--> statement-breakpoint
DROP INDEX "events_entity_id_idx";--> statement-breakpoint
DROP INDEX "evidence_case_id_idx";--> statement-breakpoint
DROP INDEX "graph_writes_case_id_idx";--> statement-breakpoint
DROP INDEX "jobs_case_id_idx";--> statement-breakpoint
DROP INDEX "proposals_case_id_idx";--> statement-breakpoint
DROP INDEX "questions_entity_id_idx";--> statement-breakpoint
CREATE INDEX "claims_entity_created_idx" ON "claims" USING btree ("entity_id","created_at","id");--> statement-breakpoint
CREATE INDEX "entities_case_name_idx" ON "entities" USING btree ("case_id","name","id");--> statement-breakpoint
CREATE INDEX "events_entity_when_idx" ON "events" USING btree ("entity_id","when","id");--> statement-breakpoint
CREATE INDEX "evidence_case_captured_idx" ON "evidence" USING btree ("case_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "graph_writes_case_created_idx" ON "graph_writes" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "jobs_case_updated_idx" ON "jobs" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "proposals_case_created_idx" ON "proposals" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "questions_entity_created_idx" ON "questions" USING btree ("entity_id","created_at","id");