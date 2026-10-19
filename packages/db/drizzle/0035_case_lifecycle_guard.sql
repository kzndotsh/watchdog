-- Issue #304: the database enforces the Case lifecycle for the application role.
--
-- A Case is deleted in two steps (a tombstone, then a purge) and every step leaves a row in the
-- permanent `case_deletion_records` log. Core writes that row in the same transaction, before the
-- change. This BEFORE trigger on `cases` makes the database refuse a change that has no matching
-- record, the way migration 0033 refuses a Graph write that has no history context. When
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
-- The role is matched by name, as in 0033 (a test keeps it equal to `APP_ROLE`), and the trigger
-- is a no-op on a database without that role. Pins `search_path = pg_catalog, pg_temp` and
-- qualifies everything, like 0031 and 0033. Not tamper-resistant against the owner, who can drop
-- the trigger.
--
-- Hand-written SQL: drizzle does not model triggers, so this migration has no schema change and
-- its snapshot equals 0034's.

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
