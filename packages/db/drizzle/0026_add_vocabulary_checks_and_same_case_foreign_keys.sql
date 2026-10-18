-- Same-Case integrity (#302), step 4 of 4: constrain. Runs after 0024 filled the columns and
-- 0025 proved no stored row breaks a rule, so every ADD below validates cleanly.
--
-- Two edits to what drizzle-kit generated, neither visible to its snapshot:
--  * The unique (id, case_id) constraints come FIRST: the composite foreign keys need them as their
--    target, and drizzle-kit lists foreign keys before unique constraints.
--  * `evidence` and `tasks` clear a deleted Entity with `ON DELETE SET NULL ("entity_id")`
--    (Postgres 15+): without the column list the action would also null `case_id`, which is NOT NULL.
--
-- NOT VALID + VALIDATE CONSTRAINT is deliberately not used: drizzle's migrator applies every pending
-- migration in one transaction, so the lock taken by ADD CONSTRAINT is held to the end either way
-- and splitting it would only add statements. Large installs pay one table scan per constraint,
-- once, with the report migration having already ruled out a failure.
ALTER TABLE "claims" ADD CONSTRAINT "claims_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_id_case_id_uq" UNIQUE("id","case_id");
--> statement-breakpoint
ALTER TABLE "claim_evidence" DROP CONSTRAINT "claim_evidence_claim_id_claims_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_evidence" DROP CONSTRAINT "claim_evidence_evidence_id_evidence_id_fk";
--> statement-breakpoint
ALTER TABLE "claims" DROP CONSTRAINT "claims_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "edge_evidence" DROP CONSTRAINT "edge_evidence_edge_id_edges_id_fk";
--> statement-breakpoint
ALTER TABLE "edge_evidence" DROP CONSTRAINT "edge_evidence_evidence_id_evidence_id_fk";
--> statement-breakpoint
ALTER TABLE "edges" DROP CONSTRAINT "edges_from_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "edges" DROP CONSTRAINT "edges_to_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "identifier_evidence" DROP CONSTRAINT "identifier_evidence_identifier_id_identifiers_id_fk";
--> statement-breakpoint
ALTER TABLE "identifier_evidence" DROP CONSTRAINT "identifier_evidence_evidence_id_evidence_id_fk";
--> statement-breakpoint
ALTER TABLE "identifiers" DROP CONSTRAINT "identifiers_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_entity_id_entities_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_evidence" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "edge_evidence" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "edges" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "identifier_evidence" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "identifiers" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "case_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_id_case_id_fk" FOREIGN KEY ("claim_id","case_id") REFERENCES "public"."claims"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "edge_evidence" ADD CONSTRAINT "edge_evidence_edge_id_case_id_fk" FOREIGN KEY ("edge_id","case_id") REFERENCES "public"."edges"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "edge_evidence" ADD CONSTRAINT "edge_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_id_case_id_fk" FOREIGN KEY ("from_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_id_case_id_fk" FOREIGN KEY ("to_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ("entity_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "identifier_evidence" ADD CONSTRAINT "identifier_evidence_identifier_id_case_id_fk" FOREIGN KEY ("identifier_id","case_id") REFERENCES "public"."identifiers"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "identifier_evidence" ADD CONSTRAINT "identifier_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_evidence" ADD CONSTRAINT "job_evidence_job_id_case_id_fk" FOREIGN KEY ("job_id","case_id") REFERENCES "public"."jobs"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_evidence" ADD CONSTRAINT "job_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposal_evidence" ADD CONSTRAINT "proposal_evidence_proposal_id_case_id_fk" FOREIGN KEY ("proposal_id","case_id") REFERENCES "public"."proposals"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposal_evidence" ADD CONSTRAINT "proposal_evidence_evidence_id_case_id_fk" FOREIGN KEY ("evidence_id","case_id") REFERENCES "public"."evidence"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ("entity_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_kind_vocab" CHECK ("activity"."kind" IN ('task', 'job', 'proposal', 'evidence', 'entity', 'edge', 'claim', 'identifier', 'event', 'question', 'case', 'handoff'));
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_action_vocab" CHECK ("activity"."action" IN ('created', 'status_changed', 'updated', 'reordered', 'deleted', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'accepted', 'rejected', 'captured', 'hidden', 'restored', 'attached', 'processed', 'retracted', 'resolved', 'opened'));
--> statement-breakpoint
ALTER TABLE "auth"."auth_event" ADD CONSTRAINT "auth_event_kind_vocab" CHECK ("auth"."auth_event"."kind" IN ('session.created'));
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_class_vocab" CHECK ("claims"."class" IN ('observation', 'assessment', 'allegation', 'other'));
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_confidence_vocab" CHECK ("claims"."confidence" IN ('unverified', 'possible', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_retract_kind_vocab" CHECK ("claims"."retract_kind" IN ('retracted', 'contested', 'disproved'));
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_predicate_vocab" CHECK ("edges"."predicate" IN ('operates', 'owns', 'hosted_on', 'leads', 'founded', 'member_of', 'employee_of', 'associate_of', 'same_as', 'suspected_as', 'resolves_to', 'dns_via', 'mail_via', 'shares_ip_with', 'primary_domain', 'parent_of', 'registers', 'related_to'));
--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_confidence_vocab" CHECK ("edges"."confidence" IN ('unverified', 'possible', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_kind_vocab" CHECK ("entities"."kind" IN ('person', 'infra', 'org'));
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_kind_vocab" CHECK ("evidence"."kind" IN ('file', 'url_archive', 'attestation', 'other'));
--> statement-breakpoint
ALTER TABLE "graph_writes" ADD CONSTRAINT "graph_writes_channel_vocab" CHECK ("graph_writes"."channel" IN ('agent_write'));
--> statement-breakpoint
ALTER TABLE "graph_writes" ADD CONSTRAINT "graph_writes_confidence_vocab" CHECK ("graph_writes"."confidence" IN ('unverified', 'possible', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_type_vocab" CHECK ("identifiers"."type" IN ('email', 'handle', 'phone', 'url', 'domain', 'ip', 'crypto', 'pgp', 'credential', 'other'));
--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_confidence_vocab" CHECK ("identifiers"."confidence" IN ('unverified', 'possible', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_status_vocab" CHECK ("identifiers"."status" IN ('current', 'former', 'unknown'));
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_vocab" CHECK ("jobs"."status" IN ('queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_status_vocab" CHECK ("playbook_runs"."status" IN ('running', 'finished', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_status_vocab" CHECK ("proposals"."status" IN ('pending', 'accepted', 'rejected'));
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_status_vocab" CHECK ("questions"."status" IN ('open', 'resolved'));
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_vocab" CHECK ("tasks"."status" IN ('backlog', 'in_progress', 'blocked', 'done', 'dropped'));
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_vocab" CHECK ("tasks"."priority" IN ('low', 'medium', 'high'));
