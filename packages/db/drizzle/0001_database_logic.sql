-- Hand-written SQL that drizzle does not model, in its final form: the two foreign keys that
-- need a column list, then every function and trigger. The generated baseline (0000) holds the
-- tables, indexes and CHECK constraints. Edit this file only through a new migration.
--
-- Every function pins `search_path = pg_catalog, pg_temp` and qualifies every relation with
-- `public.`, so a session cannot shadow `cases` (or anything else) with a temp table. The
-- functions that write `graph_history` are SECURITY DEFINER, so the application role
-- (`watchdog_app`, `packages/db/src/app-role.ts`) needs no INSERT on it.
--
-- Not tamper-resistant against the role that owns the tables (it can drop these triggers): the
-- separate application role is what makes them hold.

-- `ON DELETE SET NULL (entity_id)` (Postgres 15+) nulls only the entity, never the Case column the
-- composite key shares with it. Drizzle cannot spell the column list.
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_entity_id_case_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ("entity_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_entity_id_case_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_entity_id_case_id_fk" FOREIGN KEY ("entity_id","case_id") REFERENCES "public"."entities"("id","case_id") ON DELETE set null ("entity_id") ON UPDATE no action;
--> statement-breakpoint
-- The payload is only a wake-up (about 80 bytes); readers fetch the rows.
-- Postgres queues a NOTIFY issued in a transaction and delivers it at commit,
-- in commit order, and drops it on rollback.
CREATE FUNCTION "activity_notify"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'watchdog_activity',
    json_build_object('id', NEW."id", 'caseId', NEW."case_id")::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "activity_notify_trg"
AFTER INSERT ON "activity"
FOR EACH ROW EXECUTE FUNCTION "activity_notify"();
--> statement-breakpoint
-- #302: Evidence cited by a Proposal or Job cannot be hard-deleted (the Evidence end of
-- proposal_evidence / job_evidence / evidence_provider_calls is ON DELETE RESTRICT: Evidence is
-- forensic). A Case delete must still remove everything in it, but Postgres checks RESTRICT when
-- the cascaded Evidence delete finishes, before the cascade has reached the Job or Proposal and its
-- link rows. So the Case's link rows go first, in a BEFORE DELETE trigger on cases. SECURITY
-- DEFINER (as the owner, like graph_history's triggers): the application role may not DELETE an
-- audit table such as evidence_provider_calls, yet a Case delete must still clear it.
CREATE FUNCTION public."evidence_links_before_case_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  DELETE FROM public."proposal_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."job_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."evidence_provider_calls" WHERE "case_id" = OLD."id";
  RETURN OLD;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER "evidence_links_before_case_delete_trg"
  BEFORE DELETE ON "cases"
  FOR EACH ROW EXECUTE FUNCTION "evidence_links_before_case_delete"();
--> statement-breakpoint
-- Graph history and attribution live in the database (#303). Row triggers on the seven Graph
-- tables (entities, edges, identifiers, claims, events, questions, tasks) write `graph_history`
-- themselves, so no write path can skip it: an application bug, a cascade, a seed or a hand-written
-- statement is recorded the same way. Who and through which door come from transaction-local
-- settings that core sets once per write transaction (`set_config('watchdog.actor_id' |
-- 'watchdog.actor_label' | 'watchdog.actor_key_id' | 'watchdog.channel', ..., true)`); a write with
-- no setting is channel `system` with no actor. created_by / updated_by are filled from the same
-- settings by a BEFORE trigger. `actor_key_id` is the API key's own id (no foreign key: deleting a
-- key keeps the trail).

CREATE FUNCTION "public"."graph_history_setting"(p_name text) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT nullif(pg_catalog.current_setting(p_name, true), '') $$;
--> statement-breakpoint
-- The Evidence ids linked to a Claim, Identifier or Edge, sorted, as a JSON array.
CREATE FUNCTION "public"."graph_history_evidence_ids"(p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_ids jsonb;
BEGIN
  IF p_kind = 'claim' THEN
    SELECT coalesce(jsonb_agg(l."evidence_id" ORDER BY l."evidence_id"), '[]'::jsonb) INTO v_ids
    FROM "public"."claim_evidence" l WHERE l."claim_id" = p_id;
  ELSIF p_kind = 'identifier' THEN
    SELECT coalesce(jsonb_agg(l."evidence_id" ORDER BY l."evidence_id"), '[]'::jsonb) INTO v_ids
    FROM "public"."identifier_evidence" l WHERE l."identifier_id" = p_id;
  ELSIF p_kind = 'edge' THEN
    SELECT coalesce(jsonb_agg(l."evidence_id" ORDER BY l."evidence_id"), '[]'::jsonb) INTO v_ids
    FROM "public"."edge_evidence" l WHERE l."edge_id" = p_id;
  END IF;
  RETURN v_ids;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."graph_history_ids_minus"(p_a jsonb, p_b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(e ORDER BY e), '[]'::jsonb)
  FROM jsonb_array_elements_text(p_a) e
  WHERE e NOT IN (SELECT jsonb_array_elements_text(p_b))
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."graph_history_ids_union"(p_a jsonb, p_b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(e ORDER BY e), '[]'::jsonb)
  FROM (SELECT jsonb_array_elements_text(p_a) AS e UNION SELECT jsonb_array_elements_text(p_b)) u
$$;
--> statement-breakpoint
-- A row as history stores it: to_jsonb plus `evidence_ids` for a Claim, Identifier or Edge.
CREATE FUNCTION "public"."graph_history_snapshot"(p_kind text, p_row jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_row IS NULL THEN NULL
    WHEN p_kind IN ('claim', 'identifier', 'edge') THEN
      p_row || jsonb_build_object('evidence_ids', "public"."graph_history_evidence_ids"(p_kind, (p_row->>'id')::uuid))
    ELSE p_row
  END
$$;
--> statement-breakpoint
-- The one writer of graph_history. Only the owner may call it (the SECURITY
-- DEFINER trigger functions below run as the owner). Writes nothing for a Case
-- that is gone: a Case delete cascades through the Graph tables and the history
-- goes with the Case, so recording those cascaded changes would only trip its
-- foreign key.
CREATE FUNCTION "public"."graph_history_append"(
  p_case uuid, p_kind text, p_row uuid, p_op text, p_before jsonb, p_after jsonb
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."cases" c WHERE c."id" = p_case) THEN
    RETURN;
  END IF;
  INSERT INTO "public"."graph_history" ("case_id", "kind", "row_id", "op", "channel", "actor_id", "actor_label", "actor_key_id", "before", "after")
  VALUES (
    p_case, p_kind, p_row, p_op,
    CASE WHEN "public"."graph_history_setting"('watchdog.channel') IN ('dossier', 'triage_accept', 'agent_write')
      THEN "public"."graph_history_setting"('watchdog.channel') ELSE 'system' END,
    "public"."graph_history_setting"('watchdog.actor_id'),
    "public"."graph_history_setting"('watchdog.actor_label'),
    "public"."graph_history_setting"('watchdog.actor_key_id'),
    p_before, p_after
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."graph_history_append"(uuid, text, uuid, text, jsonb, jsonb) FROM PUBLIC;
--> statement-breakpoint
-- AFTER INSERT / UPDATE / DELETE on a Graph table; TG_ARGV[0] is the row kind.
-- An UPDATE that changes nothing but updated_at / updated_by / version records nothing.
CREATE FUNCTION "public"."graph_history_row"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_op text;
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_case uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'create';
    v_after := to_jsonb(NEW);
    v_row := v_after;
  ELSIF TG_OP = 'UPDATE' THEN
    v_op := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_row := v_after;
    IF (v_before - 'updated_at' - 'updated_by' - 'version') = (v_after - 'updated_at' - 'updated_by' - 'version') THEN
      RETURN NULL;
    END IF;
    -- a Claim that turns retracted is a retract, not an edit
    IF (v_before->>'retracted') IS DISTINCT FROM 'true' AND (v_after->>'retracted') = 'true' THEN
      v_op := 'retract';
    END IF;
  ELSE
    v_op := 'delete';
    v_before := to_jsonb(OLD);
    v_row := v_before;
  END IF;
  v_case := (v_row->>'case_id')::uuid;
  IF v_case IS NULL AND v_op = 'delete' THEN
    RETURN NULL;
  END IF;
  IF v_case IS NULL THEN
    RAISE EXCEPTION 'graph_history: no Case for % %', v_kind, v_row->>'id';
  END IF;
  PERFORM "public"."graph_history_append"(
    v_case, v_kind, (v_row->>'id')::uuid, v_op,
    "public"."graph_history_snapshot"(v_kind, v_before),
    "public"."graph_history_snapshot"(v_kind, v_after)
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- A change to the Evidence a Claim, Identifier or Edge cites is an update of that
-- row: one history row per parent per statement (a replace is a delete and an
-- insert, so two). TG_ARGV: kind, parent table, parent column in the link table.
CREATE FUNCTION "public"."graph_history_link_changed"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_table text := TG_ARGV[1];
  v_col text := TG_ARGV[2];
  v_parent uuid;
  v_old jsonb;
  v_new jsonb;
  v_delta jsonb;
  v_now jsonb;
  v_before jsonb;
  v_case uuid;
BEGIN
  FOR v_parent IN EXECUTE format('SELECT DISTINCT %I FROM changed', v_col) LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM "public".%I t WHERE t."id" = $1', v_table) INTO v_old USING v_parent;
    CONTINUE WHEN v_old IS NULL;
    -- Touch the parent so its last editor is the one who changed its Evidence (the
    -- row trigger records nothing for a touch: only updated_at / updated_by moved).
    EXECUTE format('UPDATE "public".%I SET "updated_at" = now() WHERE "id" = $1', v_table) USING v_parent;
    EXECUTE format('SELECT to_jsonb(t) FROM "public".%I t WHERE t."id" = $1', v_table) INTO v_new USING v_parent;
    EXECUTE format('SELECT coalesce(jsonb_agg(evidence_id ORDER BY evidence_id), ''[]''::jsonb) FROM changed WHERE %I = $1', v_col)
      INTO v_delta USING v_parent;
    v_now := "public"."graph_history_evidence_ids"(v_kind, v_parent);
    IF TG_OP = 'INSERT' THEN
      v_before := "public"."graph_history_ids_minus"(v_now, v_delta);
    ELSE
      v_before := "public"."graph_history_ids_union"(v_now, v_delta);
    END IF;
    v_case := (v_new->>'case_id')::uuid;
    CONTINUE WHEN v_case IS NULL;
    PERFORM "public"."graph_history_append"(
      v_case, v_kind, v_parent, 'update',
      v_old || jsonb_build_object('evidence_ids', v_before),
      v_new || jsonb_build_object('evidence_ids', v_now)
    );
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- created_by / updated_by from the same settings, so there is one source.
-- A statement that sets an author to a different value than the row holds keeps what it set;
-- every other write, including an UPDATE that leaves updated_by as it was, takes the actor from
-- the settings, NULL when there is none.
CREATE FUNCTION "public"."graph_attribution"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."created_by" := coalesce(NEW."created_by", "public"."graph_history_setting"('watchdog.actor_id'));
    NEW."updated_by" := coalesce(NEW."updated_by", "public"."graph_history_setting"('watchdog.actor_id'));
  ELSIF NEW."updated_by" IS NOT DISTINCT FROM OLD."updated_by" THEN
    NEW."updated_by" := "public"."graph_history_setting"('watchdog.actor_id');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('entities', 'entity'),
      ('edges', 'edge'),
      ('identifiers', 'identifier'),
      ('claims', 'claim'),
      ('events', 'event'),
      ('questions', 'question'),
      ('tasks', 'task')
    ) AS v(tbl, kind)
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "graph_attribution_trg" BEFORE INSERT OR UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_attribution"()',
      t.tbl);
    -- Named to sort before the foreign-key triggers, so a deleted Claim's snapshot
    -- still sees the Evidence links the cascade is about to remove.
    EXECUTE format(
      'CREATE TRIGGER "AA_graph_history_row" AFTER INSERT OR UPDATE OR DELETE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_history_row"(%L)',
      t.tbl, t.kind);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_ins_trg" AFTER INSERT ON "public"."claim_evidence"
REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('claim', 'claims', 'claim_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_del_trg" AFTER DELETE ON "public"."claim_evidence"
REFERENCING OLD TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('claim', 'claims', 'claim_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_ins_trg" AFTER INSERT ON "public"."identifier_evidence"
REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('identifier', 'identifiers', 'identifier_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_del_trg" AFTER DELETE ON "public"."identifier_evidence"
REFERENCING OLD TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('identifier', 'identifiers', 'identifier_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_ins_trg" AFTER INSERT ON "public"."edge_evidence"
REFERENCING NEW TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('edge', 'edges', 'edge_id');
--> statement-breakpoint
CREATE TRIGGER "graph_history_link_del_trg" AFTER DELETE ON "public"."edge_evidence"
REFERENCING OLD TABLE AS changed FOR EACH STATEMENT
EXECUTE FUNCTION "public"."graph_history_link_changed"('edge', 'edges', 'edge_id');
--> statement-breakpoint
-- graph_history is append-only. UPDATE is refused; DELETE is refused while the
-- Case exists (the Case's own ON DELETE CASCADE is the only way rows leave, so a
-- purge takes the history with it); TRUNCATE is refused unless the operator opts
-- in for the transaction (`SET LOCAL watchdog.allow_history_truncate = 'on'`:
-- `just wipe` and the test resets do).
CREATE FUNCTION "public"."graph_history_guard"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'graph_history is append-only: UPDATE is not allowed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "public"."cases" c WHERE c."id" = OLD."case_id") THEN
    RAISE EXCEPTION 'graph_history is append-only: rows go only with their Case'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "graph_history_guard_trg"
BEFORE UPDATE OR DELETE ON "public"."graph_history"
FOR EACH ROW EXECUTE FUNCTION "public"."graph_history_guard"();
--> statement-breakpoint
CREATE FUNCTION "public"."graph_history_no_truncate"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF "public"."graph_history_setting"('watchdog.allow_history_truncate') = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'graph_history is append-only: TRUNCATE is not allowed'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "graph_history_no_truncate_trg"
BEFORE TRUNCATE ON "public"."graph_history"
FOR EACH STATEMENT EXECUTE FUNCTION "public"."graph_history_no_truncate"();
--> statement-breakpoint
-- Optimistic concurrency on Graph edits (#307). `version` is a per-row integer: 1 on insert, +1 on
-- every UPDATE of the six Graph tables a person or agent edits (`tasks` are case work items and keep
-- last-write-wins). A caller reads the version with the row and sends it back; the repo's UPDATE adds
-- `AND version = $n`. This BEFORE UPDATE trigger owns the increment (never the repo, never a
-- caller): it also bumps on a cascade or the Evidence-link touch of `graph_history_link_changed`.
CREATE FUNCTION "public"."graph_version_bump"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities', 'edges', 'identifiers', 'claims', 'events', 'questions']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "graph_version_trg" BEFORE UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_version_bump"()',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The application role may not write the Graph without saying who is writing (#352). When
-- `current_user` is `watchdog_app` and `watchdog.channel` is unset or empty, an INSERT, UPDATE or
-- DELETE on a Graph table, on a link table that records history, or a DELETE on `cases` (which
-- cascades into the Graph) raises SQLSTATE WD001. The owner role is never refused and is recorded as
-- `system`; cascades are never refused either (they run as the owner of the referencing table). The
-- role is matched by name, as `APP_ROLE` names it (a test keeps the two equal): on a database
-- without that role the trigger is a no-op.
CREATE FUNCTION "public"."graph_require_history_context"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user = 'watchdog_app'
     AND "public"."graph_history_setting"('watchdog.channel') IS NULL THEN
    RAISE EXCEPTION 'graph write on "%" refused: no history context is set for this transaction (watchdog.channel is unset)', TG_TABLE_NAME
      USING ERRCODE = 'WD001',
            HINT = 'Call setHistoryContextEffect(tx, ctx) in @watchdog/core as the first statement of the write transaction (setGraphHistoryContext in @watchdog/db); in tests, seed through the seed* helpers or wrap the write in withSystemHistoryContext from @watchdog/test-db.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entities', 'edges', 'identifiers', 'claims', 'events', 'questions', 'tasks',
    'claim_evidence', 'identifier_evidence', 'edge_evidence'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "graph_history_context_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_require_history_context"()',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
-- A Case delete cascades through every Graph table (and `graph_history` goes with it), so the
-- application role may delete one only with a history context too.
CREATE TRIGGER "graph_history_context_guard_trg" BEFORE DELETE ON "public"."cases"
FOR EACH ROW EXECUTE FUNCTION "public"."graph_require_history_context"();
--> statement-breakpoint
-- the database enforces the Case lifecycle for the application role.
--
-- A Case is deleted in two steps (a tombstone, then a purge) and every step leaves a row in the
-- permanent `case_deletion_records` log. Core writes that row in the same transaction, before the
-- change. This BEFORE trigger on `cases` makes the database refuse a change that has no matching
-- record, the way the Graph write guard above refuses a Graph write that has no history context. When
-- `current_user` is the application role (`watchdog_app`, `packages/db/src/app-role.ts`):
--
--   DELETE   only a tombstoned Case (`deleted_at` set), and only with a `purged` record of the
--            current transaction;
--   UPDATE   a change to `deleted_at`, `deleted_by`, `purge_after`, `purge_started_at` or
--            `purge_error` needs a record of this transaction for the Case: `deleted` when it
--            becomes deleted, `restored` when it becomes live again, `purge_started` when the
--            purge begins, `purge_failed` when a new failure is stored, and at least one of them
--            for any other change of those columns. A restore is refused once the purge began, and
--            a begun purge cannot be taken back.
--
-- A record belongs to the transaction when its `xid` (default `pg_current_xact_id()`) equals the
-- current transaction's id, so it must be written first, in the same transaction, and a record
-- left over from an earlier transaction proves nothing. Refusals raise SQLSTATE WD002.
--
-- The owner role is never refused: migrations, `just wipe`, the owner-run test reset and manual
-- maintenance may edit Cases without a record (they leave none; that is the documented path).
-- Cascades from other tables never reach `cases`. Organization deletion runs as the application
-- role and goes through the same tombstone and purge records (`deleteOrganizationCasesEffect`).
-- The role is matched by name, as for the Graph write guard (a test keeps it equal to
-- `APP_ROLE`), and the trigger is a no-op on a database without that role.
CREATE FUNCTION "public"."cases_lifecycle_guard"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  has_event text;
BEGIN
  IF current_user <> 'watchdog_app' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'delete of case % refused: it is not deleted (tombstone it first)', OLD.id
        USING ERRCODE = 'WD002',
              HINT = 'A Case is hard-deleted only by a purge of a tombstone: deleteCaseEffect, then purgeCaseEffect in @watchdog/core.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "public"."case_deletion_records" r
      WHERE r.case_id = OLD.id AND r.event = 'purged' AND r.xid = pg_current_xact_id()
    ) THEN
      RAISE EXCEPTION 'delete of case % refused: no purged deletion record in this transaction', OLD.id
        USING ERRCODE = 'WD002',
              HINT = 'Insert the purged record (caseDeletionRecordsRepo.append) before the delete, in the same transaction.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND NEW.deleted_by IS NOT DISTINCT FROM OLD.deleted_by
     AND NEW.purge_after IS NOT DISTINCT FROM OLD.purge_after
     AND NEW.purge_started_at IS NOT DISTINCT FROM OLD.purge_started_at
     AND NEW.purge_error IS NOT DISTINCT FROM OLD.purge_error THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND OLD.purge_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'restore of case % refused: its purge has begun', OLD.id
      USING ERRCODE = 'WD002',
            HINT = 'A Case whose purge began can only be purged.';
  END IF;
  IF OLD.purge_started_at IS NOT NULL AND NEW.purge_started_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'case % refused: a begun purge cannot be taken back', OLD.id
      USING ERRCODE = 'WD002';
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    has_event := 'deleted';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    has_event := 'restored';
  ELSIF OLD.purge_started_at IS NULL AND NEW.purge_started_at IS NOT NULL THEN
    has_event := 'purge_started';
  ELSIF NEW.purge_error IS NOT NULL AND NEW.purge_error IS DISTINCT FROM OLD.purge_error THEN
    has_event := 'purge_failed';
  ELSE
    has_event := NULL;
  END IF;

  IF has_event IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "public"."case_deletion_records" r
      WHERE r.case_id = OLD.id AND r.event = has_event AND r.xid = pg_current_xact_id()
    ) THEN
      RAISE EXCEPTION 'change of case % refused: no % deletion record in this transaction', OLD.id, has_event
        USING ERRCODE = 'WD002',
              HINT = 'Insert the record (caseDeletionRecordsRepo.append) before the change, in the same transaction.';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM "public"."case_deletion_records" r
    WHERE r.case_id = OLD.id AND r.xid = pg_current_xact_id()
  ) THEN
    RAISE EXCEPTION 'change of case % refused: no deletion record in this transaction', OLD.id
      USING ERRCODE = 'WD002',
            HINT = 'Insert the record (caseDeletionRecordsRepo.append) before the change, in the same transaction.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "cases_lifecycle_guard_trg" BEFORE UPDATE OR DELETE ON "public"."cases"
FOR EACH ROW EXECUTE FUNCTION "public"."cases_lifecycle_guard"();
