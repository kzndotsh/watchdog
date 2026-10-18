-- Issue #303: graph_history is append-only.
--
-- 1. A trigger, so the rule holds for every role including the table owner and
--    a deployment whose app role is not called watchdog_app:
--    - UPDATE is always refused;
--    - DELETE is refused while the Case exists. The only way a history row
--      goes is the Case's own ON DELETE CASCADE (a purge): by then the Case row
--      is already gone inside the same statement, so the guard lets it pass.
--    TRUNCATE is not blocked: `just wipe` truncates cases and everything under
--    them, and truncating needs privileges the app role does not have.
-- 2. Where the dev/CI app role `watchdog_app` exists (docker/postgres/init.sql,
--    scripts/ensure-test-db.sh), UPDATE and DELETE are revoked from it, so the
--    refusal is a privilege error (42501) before any trigger runs. The role is
--    created outside migrations, so the revoke is conditional and
--    scripts/ensure-test-db.sh repeats it after its blanket GRANT. Cascades run
--    with the table owner's privileges, so the Case purge is unaffected.
CREATE FUNCTION "graph_history_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'graph_history is append-only: UPDATE is not allowed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "cases" WHERE "id" = OLD."case_id") THEN
    RAISE EXCEPTION 'graph_history is append-only: rows go only with their Case'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "graph_history_guard_trg"
BEFORE UPDATE OR DELETE ON "graph_history"
FOR EACH ROW EXECUTE FUNCTION "graph_history_guard"();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') THEN
    REVOKE UPDATE, DELETE ON "graph_history" FROM "watchdog_app";
  END IF;
END $$;
