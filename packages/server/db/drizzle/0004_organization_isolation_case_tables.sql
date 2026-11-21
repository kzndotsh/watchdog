-- Organization isolation (#719): row-level security on every Case-scoped table, as 0003 did for
-- `cases` and `claims`, keyed on the transaction-local `watchdog.org_id` read through
-- `graph_history_setting` ('' maps to NULL, so no organization reads and writes no row).
--
-- The statements up to the last policy are as `drizzle-kit generate` wrote them from
-- `src/schema/*.ts` (the snapshot `meta/0004_snapshot.json` matches them). Two policy shapes:
-- - A copy of the Case's organization (`organization_id`, NOT NULL, held to the Case's own by a
--   composite foreign key into `cases (id, organization_id)`) on every table a declared list
--   pages, a list joins or Case search scans: Entities, Edges, Events, Questions, Identifiers,
--   Evidence, Tasks, Jobs, playbook runs, Proposals, `graph_history` and `changesets`. The policy
--   is a plain equality on a column of the row, so list plans keep their indexes (the Claims
--   lesson of 0003). `activity` and `case_deletion_records` already hold the organization.
-- - A lookup through `cases` (`exists` on its primary key, under `cases`' own policy) on the
--   rest: the Evidence link tables, the provider-call records, `cap_cache`, `evidence_uploads`,
--   `finding_suppressions` and Collect's projection tables, which are read through a parent row
--   or by a Case's own index and need no column of their own.
-- Added with NOT NULL and no backfill: nobody uses Watchdog yet, local data is wiped.
--
-- Hand-added after the generated part, because drizzle models neither functions, triggers nor
-- statistics: the BEFORE INSERT trigger that fills each copy, `job_organization_id` for the
-- worker, the process-wide `activity_log_*` reads of the activity log, and the planner statistics
-- on the copies. Each SECURITY DEFINER function is revoked from PUBLIC and granted to the
-- application role by the migrator (`APP_FUNCTIONS`).
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cap_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_deletion_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "changesets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claim_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collect_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collect_queue_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collect_queue_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collect_queue_stale" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "edge_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "edges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_provider_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finding_suppressions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "graph_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identifier_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identifiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "playbook_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proposal_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_call_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "changesets" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_history" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "identifiers" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_history" ADD CONSTRAINT "graph_history_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identifiers" ADD CONSTRAINT "identifiers_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "activity_organization_isolation" ON "activity" AS PERMISSIVE FOR ALL TO public USING ("activity"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("activity"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "cap_cache_organization_isolation" ON "cap_cache" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "cap_cache"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "cap_cache"."case_id"));--> statement-breakpoint
CREATE POLICY "case_deletion_records_organization_isolation" ON "case_deletion_records" AS PERMISSIVE FOR ALL TO public USING ("case_deletion_records"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("case_deletion_records"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "changesets_organization_isolation" ON "changesets" AS PERMISSIVE FOR ALL TO public USING ("changesets"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("changesets"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "claim_evidence_organization_isolation" ON "claim_evidence" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "claim_evidence"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "claim_evidence"."case_id"));--> statement-breakpoint
CREATE POLICY "collect_queue_organization_isolation" ON "collect_queue" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "collect_queue"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "collect_queue"."case_id"));--> statement-breakpoint
CREATE POLICY "collect_queue_case_organization_isolation" ON "collect_queue_case" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "collect_queue_case"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "collect_queue_case"."case_id"));--> statement-breakpoint
CREATE POLICY "collect_queue_member_organization_isolation" ON "collect_queue_member" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "collect_queue_member"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "collect_queue_member"."case_id"));--> statement-breakpoint
CREATE POLICY "collect_queue_stale_organization_isolation" ON "collect_queue_stale" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "collect_queue_stale"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "collect_queue_stale"."case_id"));--> statement-breakpoint
CREATE POLICY "edge_evidence_organization_isolation" ON "edge_evidence" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "edge_evidence"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "edge_evidence"."case_id"));--> statement-breakpoint
CREATE POLICY "edges_organization_isolation" ON "edges" AS PERMISSIVE FOR ALL TO public USING ("edges"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("edges"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "entities_organization_isolation" ON "entities" AS PERMISSIVE FOR ALL TO public USING ("entities"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("entities"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "events_organization_isolation" ON "events" AS PERMISSIVE FOR ALL TO public USING ("events"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("events"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "evidence_organization_isolation" ON "evidence" AS PERMISSIVE FOR ALL TO public USING ("evidence"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("evidence"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "evidence_provider_calls_organization_isolation" ON "evidence_provider_calls" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "evidence_provider_calls"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "evidence_provider_calls"."case_id"));--> statement-breakpoint
CREATE POLICY "evidence_uploads_organization_isolation" ON "evidence_uploads" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "evidence_uploads"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "evidence_uploads"."case_id"));--> statement-breakpoint
CREATE POLICY "finding_suppressions_organization_isolation" ON "finding_suppressions" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "finding_suppressions"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "finding_suppressions"."case_id"));--> statement-breakpoint
CREATE POLICY "graph_history_organization_isolation" ON "graph_history" AS PERMISSIVE FOR ALL TO public USING ("graph_history"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("graph_history"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "identifier_evidence_organization_isolation" ON "identifier_evidence" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "identifier_evidence"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "identifier_evidence"."case_id"));--> statement-breakpoint
CREATE POLICY "identifiers_organization_isolation" ON "identifiers" AS PERMISSIVE FOR ALL TO public USING ("identifiers"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("identifiers"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "job_evidence_organization_isolation" ON "job_evidence" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "job_evidence"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "job_evidence"."case_id"));--> statement-breakpoint
CREATE POLICY "jobs_organization_isolation" ON "jobs" AS PERMISSIVE FOR ALL TO public USING ("jobs"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("jobs"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "playbook_runs_organization_isolation" ON "playbook_runs" AS PERMISSIVE FOR ALL TO public USING ("playbook_runs"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("playbook_runs"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "proposal_evidence_organization_isolation" ON "proposal_evidence" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "proposal_evidence"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "proposal_evidence"."case_id"));--> statement-breakpoint
CREATE POLICY "proposals_organization_isolation" ON "proposals" AS PERMISSIVE FOR ALL TO public USING ("proposals"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("proposals"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "provider_call_outcomes_organization_isolation" ON "provider_call_outcomes" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "provider_call_outcomes"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "provider_call_outcomes"."case_id"));--> statement-breakpoint
CREATE POLICY "provider_calls_organization_isolation" ON "provider_calls" AS PERMISSIVE FOR ALL TO public USING (exists (select 1 from public.cases c where c.id = "provider_calls"."case_id")) WITH CHECK (exists (select 1 from public.cases c where c.id = "provider_calls"."case_id"));--> statement-breakpoint
CREATE POLICY "questions_organization_isolation" ON "questions" AS PERMISSIVE FOR ALL TO public USING ("questions"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("questions"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "tasks_organization_isolation" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ("tasks"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("tasks"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
-- BEFORE INSERT on every table that copies its Case's organization: the organization is always
-- the Case's, whatever the insert sent (Drizzle sends NULL), as `claims_organization_from_case`
-- (0003) does for Claims. The policy's WITH CHECK then refuses a row of a Case outside the
-- transaction's organization, and the composite foreign key refuses any other value. Not SECURITY
-- DEFINER itself: `case_organization_id` is, and the trigger runs as whoever inserts (the owner's
-- history functions write `graph_history` and `changesets` through it too).
CREATE FUNCTION "public"."organization_from_case"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."organization_id" := "public"."case_organization_id"(NEW."case_id");
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'changesets', 'edges', 'entities', 'events', 'evidence', 'graph_history', 'identifiers',
    'jobs', 'playbook_runs', 'proposals', 'questions', 'tasks'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER "organization_from_case" BEFORE INSERT ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."organization_from_case"()',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The organization of a Job, for the worker, which holds a Job id from the queue and no
-- organization yet: the policy on `jobs` hides the row until one is set. SECURITY DEFINER for that
-- reason, like `case_organization_id`: it answers only with the organization id of a Job whose id
-- the caller already holds (NULL for a missing one). Revoked from PUBLIC; the migrator grants the
-- application role EXECUTE (`APP_FUNCTIONS`).
CREATE FUNCTION "public"."job_organization_id"(p_job_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT j."organization_id" FROM "public"."jobs" j WHERE j."id" = p_job_id $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."job_organization_id"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- The activity log read as a whole (ADR-0005), past the policy on `activity`: the process-wide
-- tailer (the live signal and the worker's export consumer) follows every organization's entries
-- in one `(xid, id)` order, and a cursor's bounds are positions of the whole log. SECURITY
-- DEFINER for that reason, like `case_organization_id`; revoked from PUBLIC, and the migrator
-- grants the application role EXECUTE (`APP_FUNCTIONS`). Each takes the cursor it continues from
-- and reads `activity_xid_id_idx`; the organization-scoped reads (Recent activity, a replay) read
-- the table under its policy instead.
--
-- The commit-safe entries after a cursor, oldest first: rows whose writing transaction is older
-- than every still-running one, so no row can later appear below a cursor that passed them.
CREATE FUNCTION "public"."activity_log_drain"(p_xid xid8, p_id bigint, p_limit integer)
RETURNS SETOF "public"."activity"
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT a.* FROM "public"."activity" a
   WHERE (a."xid", a."id") > (p_xid, p_id)
     AND a."xid" < pg_catalog.pg_snapshot_xmin(pg_catalog.pg_current_snapshot())
   ORDER BY a."xid", a."id"
   LIMIT p_limit
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."activity_log_drain"(xid8, bigint, integer) FROM PUBLIC;
--> statement-breakpoint
-- True when any entry, committed or not, sits past the cursor (the tailer re-polls while one does).
CREATE FUNCTION "public"."activity_log_has_past"(p_xid xid8, p_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM "public"."activity" a WHERE (a."xid", a."id") > (p_xid, p_id))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."activity_log_has_past"(xid8, bigint) FROM PUBLIC;
--> statement-breakpoint
-- The newest position of the log: of the commit-safe entries (`p_commit_safe`, the head a tailer
-- starts from) or of any entry (the ceiling a cursor is checked against). No row for an empty log.
CREATE FUNCTION "public"."activity_log_newest"(p_commit_safe boolean)
RETURNS TABLE ("xid" xid8, "id" bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT a."xid", a."id" FROM "public"."activity" a
   WHERE NOT p_commit_safe
      OR a."xid" < pg_catalog.pg_snapshot_xmin(pg_catalog.pg_current_snapshot())
   ORDER BY a."xid" DESC, a."id" DESC
   LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."activity_log_newest"(boolean) FROM PUBLIC;
--> statement-breakpoint
-- The planner's view of the copies: an organization is a function of the Case (the composite
-- foreign key), but without these statistics Postgres multiplies the policy's selectivity into
-- every Case-scoped estimate as if the two were independent (one over the number of
-- organizations), so a Case's list looked smaller than a page and was planned as a Sort of the
-- Case's rows instead of an ordered index scan (measured on the perf seed). Functional-dependency
-- statistics on (case_id, organization_id) let the estimate of `case_id = $1` stand. Built by
-- ANALYZE (autovacuum, or the perf seed's own), like every other statistic.
--
-- A row reached by a join (the Connection list's two Entities, by primary key) has no Case
-- clause for those statistics to pair with, so the policy's filter there is estimated from the
-- copy column alone. `n_distinct = 1` on the copies (never on `activity`, whose organization is
-- the Recent activity list's own scope) makes that estimate the largest organization's share
-- instead of one over the number of organizations: the policy is never the selective clause of a
-- Case-scoped read. A comparison with a known organization still reads the column's most common
-- values, which this does not change.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity', 'changesets', 'claims', 'edges', 'entities', 'events', 'evidence',
    'graph_history', 'identifiers', 'jobs', 'playbook_runs', 'proposals', 'questions', 'tasks'
  ] LOOP
    EXECUTE format(
      'CREATE STATISTICS "public".%I (dependencies) ON "case_id", "organization_id" FROM "public".%I',
      t || '_case_organization_stx', t);
    IF t <> 'activity' THEN
      EXECUTE format(
        'ALTER TABLE "public".%I ALTER COLUMN "organization_id" SET (n_distinct = 1)', t);
    END IF;
  END LOOP;
END $$;
