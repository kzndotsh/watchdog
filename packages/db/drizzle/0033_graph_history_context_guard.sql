-- Issue #352: the application role may not write the Graph without saying who is writing.
--
-- Graph history (#303) takes the actor and channel from transaction settings that core sets at the
-- start of every Graph write (`setHistoryContextEffect`). A write path that forgot to set them was
-- recorded honestly but as `system` with no author, and nothing noticed. This BEFORE trigger makes
-- the database refuse the write instead: when `current_user` is the application role
-- (`watchdog_app`, `packages/db/src/app-role.ts`) and `watchdog.channel` is unset or empty, an
-- INSERT, UPDATE or DELETE on a Graph table, on a link table that records history, or a DELETE on
-- `cases` (which cascades into the Graph) raises SQLSTATE WD001.
--
-- The owner role (migrations, seeds run as owner, manual maintenance) is never refused and is
-- recorded as `system`. Cascades are never refused either, with no special case: an `ON DELETE
-- CASCADE` / `SET NULL` action runs as the owner of the referencing table, so `current_user` there
-- is the owner, and `graph_history_link_changed` (SECURITY DEFINER) writes as the owner too. The
-- check is therefore on the statement the application itself issued.
--
-- The role is matched by name, as `APP_ROLE` names it (a test keeps the two equal): a membership
-- test (`pg_has_role`) would also match a superuser owner, who is a member of every role. On a
-- database without that role (no split) nothing matches and the trigger is a no-op.
--
-- Pins `search_path = pg_catalog, pg_temp` and qualifies everything, like 0031. Not
-- tamper-resistant against the owner (who can drop the trigger), the same limit as 0031.

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
