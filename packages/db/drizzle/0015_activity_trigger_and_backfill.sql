-- ADR-0005 S1: copy the existing Task activity into the log, then install the
-- trigger that derives the NOTIFY from every appended row.
--
-- Backfilled rows get xid 0: readable immediately and below every live cursor
-- (a transaction id is never 0), so no tailer or replay treats them as new.
-- They are inserted in (created_at, id) order so the identity ids ascend in
-- time. The trigger is created after the copy so the backfill does not send
-- one NOTIFY per copied row.
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "label", "actor_id", "from_value", "to_value", "created_at")
SELECT '0'::xid8, "case_id", "kind", "action", "subject_id", left("label", 200), "actor_id", "from_value", "to_value", "created_at"
FROM "activity_events"
ORDER BY "created_at", "id";
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
