DROP INDEX "evidence_entity_id_idx";--> statement-breakpoint
DROP INDEX "identifiers_entity_type_value_idx";--> statement-breakpoint
CREATE INDEX "evidence_case_label_idx" ON "evidence" USING btree ("case_id",coalesce("label", ''),"id");--> statement-breakpoint
CREATE INDEX "evidence_case_hidden_captured_idx" ON "evidence" USING btree ("case_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "evidence"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "evidence_entity_captured_idx" ON "evidence" USING btree ("entity_id","captured_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "evidence_label_trgm_idx" ON "evidence" USING gin ("label" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "evidence_notes_trgm_idx" ON "evidence" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "evidence_source_url_trgm_idx" ON "evidence" USING gin ("source_url" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "identifiers_case_value_idx" ON "identifiers" USING btree ("case_id","value","id");--> statement-breakpoint
CREATE INDEX "identifiers_case_created_idx" ON "identifiers" USING btree ("case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "identifiers_entity_value_idx" ON "identifiers" USING btree ("entity_id","value","id");--> statement-breakpoint
CREATE INDEX "identifiers_value_trgm_idx" ON "identifiers" USING gin ("value" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "identifiers_platform_trgm_idx" ON "identifiers" USING gin ("platform" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "identifiers_notes_trgm_idx" ON "identifiers" USING gin ("notes" gin_trgm_ops);