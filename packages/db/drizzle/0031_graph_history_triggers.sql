-- Issue #303: Graph history and attribution live in the database.
--
-- Row triggers on the seven Graph tables (entities, edges, identifiers, claims,
-- events, questions, tasks) write `graph_history` themselves, so no write path
-- can skip it: an application bug, a cascade (an Entity delete removing its
-- Claims, a SET NULL on a Task), a seed or a hand-written statement is recorded
-- the same way. Who and through which door come from three transaction-local
-- settings that core sets once per write transaction
-- (`set_config('watchdog.actor_id' | 'watchdog.actor_label' | 'watchdog.channel',
-- ..., true)`); a write with no setting is channel `system` with no actor.
-- created_by / updated_by are filled from the same settings by a BEFORE trigger.
--
-- Every function pins `search_path = pg_catalog, pg_temp` and qualifies every
-- relation with `public.`, so a session cannot shadow `cases` (or anything else)
-- with a temp table. The functions that write `graph_history` are SECURITY
-- DEFINER, so the app role needs no INSERT on it; the helper they share is not
-- callable by anyone else.
--
-- Not tamper-resistant against the role that owns the tables (and so can drop
-- these triggers): a single-superuser install is only as strong as that role.
-- The separate app role (applyAppRoleGrants, `packages/db/src/app-role.ts`, run
-- after every migration) is what makes it hold: it may only SELECT graph_history.

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
  INSERT INTO "public"."graph_history" ("case_id", "kind", "row_id", "op", "channel", "actor_id", "actor_label", "before", "after")
  VALUES (
    p_case, p_kind, p_row, p_op,
    CASE WHEN "public"."graph_history_setting"('watchdog.channel') IN ('dossier', 'triage_accept', 'agent_write')
      THEN "public"."graph_history_setting"('watchdog.channel') ELSE 'system' END,
    "public"."graph_history_setting"('watchdog.actor_id'),
    "public"."graph_history_setting"('watchdog.actor_label'),
    p_before, p_after
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."graph_history_append"(uuid, text, uuid, text, jsonb, jsonb) FROM PUBLIC;
--> statement-breakpoint
-- AFTER INSERT / UPDATE / DELETE on a Graph table; TG_ARGV[0] is the row kind.
-- An UPDATE that changes nothing but updated_at / updated_by records nothing.
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
    IF (v_before - 'updated_at' - 'updated_by') = (v_after - 'updated_at' - 'updated_by') THEN
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
-- A statement that sets an author itself (a data migration backfilling it) keeps
-- what it set; every other write takes the actor from the settings, NULL when
-- there is none.
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
