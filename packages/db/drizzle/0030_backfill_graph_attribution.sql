-- Issue #303: fill created_by / updated_by on rows that predate attribution.
--
-- The only record of who made a change is the activity log, so a row gets an
-- author only where an entry names one. created_by is the actor of the row's
-- earliest `created` entry; updated_by is the actor of its newest entry that
-- changed it (created, updated, retracted, resolved, status_changed,
-- reordered), and NULL when that entry names no actor (a system write): the row
-- was last changed by no one we can name, not by an older person. Entries pruned
-- after 90 days leave both columns NULL: NULL is the explicit "unknown"
-- (a sentinel string would masquerade as a user id). A retracted Claim with no
-- entry falls back to its own retracted_by. Idempotent: it only fills NULLs, so
-- a re-run changes nothing. Additive data only; no constraint is added here.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('entities', 'entity'),
      ('edges', 'edge'),
      ('claims', 'claim'),
      ('identifiers', 'identifier'),
      ('events', 'event'),
      ('questions', 'question'),
      ('tasks', 'task')
    ) AS t(tbl, kind)
  LOOP
    EXECUTE format($sql$
      UPDATE %1$I AS row
      SET created_by = COALESCE(row.created_by, author.created_by),
          updated_by = COALESCE(row.updated_by, author.updated_by)
      FROM (
        SELECT subject_id,
               (array_agg(actor_id ORDER BY id) FILTER (WHERE action = 'created' AND actor_id IS NOT NULL))[1] AS created_by,
               (array_agg(actor_id ORDER BY id DESC))[1] AS updated_by
        FROM activity
        WHERE kind = %2$L AND subject_id IS NOT NULL
          AND action IN ('created', 'updated', 'retracted', 'resolved', 'status_changed', 'reordered')
        GROUP BY subject_id
      ) AS author
      WHERE row.id = author.subject_id
        AND (row.created_by IS NULL OR row.updated_by IS NULL)
    $sql$, target.tbl, target.kind);
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE "claims"
SET "updated_by" = "retracted_by"
WHERE "retracted" AND "updated_by" IS NULL AND "retracted_by" IS NOT NULL;
