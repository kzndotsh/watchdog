-- #720: the worker's own database role, `watchdog_worker` (`WORKER_ROLE`, packages/server/db/src/app-role.ts).
-- The worker logs in as it, and the web app switches an API-key request to it for the request's
-- transactions (a transaction-local role change). The migrator grants it what the application role
-- has except writes to the Graph (`applyAppRoleGrants`); this migration only teaches the two guard
-- triggers of `0000_baseline` the new name, so a write by the worker role is held to the same rules
-- as one by `watchdog_app`: a Case delete (the purge) needs a history context (WD001), and a Case
-- lifecycle change needs its deletion record (WD002). The function bodies are otherwise unchanged.
-- The roles are matched by name, as before (a test keeps the names equal to `APP_ROLE` and
-- `WORKER_ROLE`), and a database without them is unaffected.
CREATE OR REPLACE FUNCTION "public"."graph_require_history_context"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('watchdog_app', 'watchdog_worker')
     AND "public"."graph_history_setting"('watchdog.channel') IS NULL THEN
    RAISE EXCEPTION 'graph write on "%" refused: no history context is set for this transaction (watchdog.channel is unset)', TG_TABLE_NAME
      USING ERRCODE = 'WD001',
            HINT = 'Call setHistoryContextEffect(tx, ctx) in @watchdog/server/core as the first statement of the write transaction (setGraphHistoryContext in @watchdog/server/db); in tests, seed through the seed* helpers or wrap the write in withSystemHistoryContext from @watchdog/server/test-db.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."cases_lifecycle_guard"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  has_event text;
BEGIN
  IF current_user NOT IN ('watchdog_app', 'watchdog_worker') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'delete of case % refused: it is not deleted (tombstone it first)', OLD.id
        USING ERRCODE = 'WD002',
              HINT = 'A Case is hard-deleted only by a purge of a tombstone: deleteCaseEffect, then purgeCaseEffect in @watchdog/server/core.';
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
