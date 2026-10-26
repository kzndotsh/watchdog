-- Custom migration (#574): the functions and triggers that keep Collect's queue (`collect_queue`,
-- `collect_queue_member`, generated in the previous migration) equal to its sources, then the
-- backfill. Conventions of `0001_database_logic`: every function pins
-- `search_path = pg_catalog, pg_temp` and qualifies `public.`; the ones that write the projection
-- are SECURITY DEFINER, so the application role only reads it (`app-role.ts`).
--
-- How a write reaches the projection:
--   1. A row trigger on `jobs`, `evidence`, `job_evidence`, `playbook_runs` or `cases` records the
--      key it changed (`collect_queue_mark`) in a temporary table of the session, and inserts one
--      marker row for the transaction into `collect_queue_tx` (ON CONFLICT DO NOTHING).
--   2. The marker's insert queues the transaction's one deferred event (`collect_queue_flush_trg`).
--      At commit, `collect_queue_flush` takes each touched Case's advisory lock in ascending key
--      order and recomputes the rows those keys reach (`collect_queue_sync`).
--   3. A Case whose flush fails rolls back only its own subtransaction and is logged in
--      `collect_queue_stale`; the writer still commits. The worker's reconcile tick rebuilds it
--      (`collect_queue_find_drift`, `collect_queue_rebuild`).
--
-- The flush reads the source tables without locking them and writes only projection rows of a
-- Case whose lock it holds, so it cannot close a lock cycle with a writer's own row locks
-- (`settleJobInTx`, `casesRepo.lockById`). Incremental sync and full rebuild call the same rule
-- functions (`collect_queue_memberships`, `collect_queue_compute`); `collect_queue_diff` compares
-- the stored rows with a recomputation, without writing.
--
-- A change to a rule (the Cap list, attachment, state, activity, search text) ships as a new
-- migration with `CREATE OR REPLACE` and the backfill statement at the end of this file, with the
-- TypeScript reference (`@watchdog/schemas/testing`, `collectQueueReference`) changed to match.

-- Process and enrich Caps link to Evidence through their input (`isProcessCapability`,
-- `URL_ENRICH_CAPABILITY_ID`); a playbook step does too, decided by the caller.
CREATE FUNCTION public.collect_input_linked_cap(p_capability_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT p_capability_id IN ('evidence.harvest', 'evidence.extract.ai', 'network.url.enrich')
$$;
--> statement-breakpoint
-- The searchable text of a Job's input: its string values under `JOB_INPUT_HINT_KEYS`, in that order.
CREATE FUNCTION public.collect_input_text(p_input jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(pg_catalog.string_agg(v.t, ' ' ORDER BY k.o), '')
  FROM pg_catalog.unnest(
    ARRAY['host', 'domain', 'ip', 'url', 'email', 'hash', 'handle', 'target', 'query', 'name']
  ) WITH ORDINALITY AS k(key, o)
  CROSS JOIN LATERAL (
    SELECT p_input ->> k.key AS t WHERE pg_catalog.jsonb_typeof(p_input -> k.key) = 'string'
  ) v
  WHERE v.t <> ''
$$;
--> statement-breakpoint
-- The second key of a Case's advisory lock (the first is the constant 1464091473, "WDCQ", so it
-- cannot meet the single-bigint locks of the migrator, the vault, bootstrap or the reconcile tick).
-- Two Cases that share a key only serialize more; locks are always taken in ascending key order.
CREATE FUNCTION public.collect_queue_lock_key(p_case uuid) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT pg_catalog.hashtext(p_case::text)
$$;
--> statement-breakpoint
-- The Evidence rows each Job could attach to (R1 of the design):
--   more than one landed row: none;
--   one landed row: it, plus the input ids when the Job links by input;
--   none landed: the input ids when the Job links by input.
-- Visibility (same Case, not hidden) is the caller's join.
CREATE FUNCTION public.collect_queue_cand(p_case uuid, p_jobs uuid[])
RETURNS TABLE (job_id uuid, evidence_id uuid)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH j AS (
    SELECT jb.id, jb.input,
           ARRAY(SELECT je.evidence_id FROM public.job_evidence je
                  WHERE je.job_id = jb.id ORDER BY je.position) AS landed,
           (public.collect_input_linked_cap(jb.capability_id) OR jb.playbook_run_id IS NOT NULL) AS linkable
    FROM public.jobs jb
    WHERE jb.case_id = p_case AND jb.id = ANY (p_jobs)
  )
  SELECT j.id, j.landed[1] FROM j WHERE pg_catalog.cardinality(j.landed) = 1
  UNION
  SELECT j.id, v.e
  FROM j CROSS JOIN LATERAL (
    VALUES (public.collect_input_evidence_id(j.input, 'evidenceId')),
           (public.collect_input_evidence_id(j.input, 'sourceEvidenceId'))
  ) AS v(e)
  WHERE j.linkable AND pg_catalog.cardinality(j.landed) <= 1 AND v.e IS NOT NULL
$$;
--> statement-breakpoint
-- Which row each Job belongs to: every visible Evidence row it could attach to, else its run
-- (`playbook_run_id`), else a row of its own.
CREATE FUNCTION public.collect_queue_memberships(p_case uuid, p_jobs uuid[])
RETURNS TABLE (job_id uuid, row_id uuid)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH att AS (
    SELECT DISTINCT c.job_id, c.evidence_id AS row_id
    FROM public.collect_queue_cand(p_case, p_jobs) c
    JOIN public.evidence e
      ON e.id = c.evidence_id AND e.case_id = p_case AND e.deleted_at IS NULL
  )
  SELECT att.job_id, att.row_id FROM att
  UNION ALL
  SELECT jb.id, coalesce(jb.playbook_run_id, jb.id)
  FROM public.jobs jb
  WHERE jb.case_id = p_case AND jb.id = ANY (p_jobs)
    AND NOT EXISTS (SELECT 1 FROM att WHERE att.job_id = jb.id)
$$;
--> statement-breakpoint
-- The rows `p_ids` should hold, given member pairs (`p_mjobs[i]` is in row `p_mrows[i]`). An id
-- with no row (a run or Job row left with no member) is absent from the result.
--   Evidence row: started and active at `captured_at`; `hidden`, `unprocessed` or `landed`.
--   Run or Job row: started at the run's or the Job's creation; active at the latest member
--     transition (created, started, finished) or hide of Evidence the member could attach to;
--     state by priority over the members no other member of the row retries.
--   capability_ids: the members' Caps and their runs' playbooks, sorted (C collation).
--   search_text: Evidence label, notes, URL (500 each); each Cap or playbook id raw and humanized;
--     per member by (created_at, id): result summary, error, interpret error, input text (200
--     each); joined by spaces, cut at 4,000 characters.
CREATE FUNCTION public.collect_queue_compute(p_case uuid, p_ids uuid[], p_mjobs uuid[], p_mrows uuid[])
RETURNS TABLE (
  id uuid, kind text, sort_at timestamptz, activity_at timestamptz, state text, entity_id uuid,
  capability_ids text[], search_text text
)
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH ev AS MATERIALIZED (
    SELECT e.id, e.captured_at, e.processed_at, e.deleted_at, e.entity_id, e.label, e.notes, e.source_url
    FROM public.evidence e
    WHERE e.case_id = p_case AND e.id = ANY (p_ids)
  ),
  mj AS MATERIALIZED (
    SELECT p.row_id, j.id, j.capability_id, j.status, j.retry_of_job_id, j.playbook_run_id,
           j.created_at, GREATEST(j.created_at, j.started_at, j.finished_at) AS t,
           j.result_summary, j.error, j.interpret_error, j.input, r.playbook_id,
           EXISTS (SELECT 1 FROM ev WHERE ev.id = p.row_id) AS on_evidence
    FROM ROWS FROM (pg_catalog.unnest(p_mjobs), pg_catalog.unnest(p_mrows)) AS p(job_id, row_id)
    JOIN public.jobs j ON j.id = p.job_id AND j.case_id = p_case
    LEFT JOIN public.playbook_runs r ON r.id = j.playbook_run_id
    WHERE p.row_id = ANY (p_ids)
  ),
  hid AS (
    SELECT c.job_id, max(e.deleted_at) AS h
    FROM public.collect_queue_cand(
      p_case, ARRAY(SELECT DISTINCT mj.id FROM mj WHERE NOT mj.on_evidence)
    ) c
    JOIN public.evidence e
      ON e.id = c.evidence_id AND e.case_id = p_case AND e.deleted_at IS NOT NULL
    GROUP BY c.job_id
  ),
  grp AS (
    SELECT mj.row_id AS id,
           CASE WHEN bool_or(mj.playbook_run_id = mj.row_id) THEN 'run' ELSE 'job' END AS kind,
           min(mj.created_at) AS first_created,
           max(GREATEST(mj.t, hid.h)) AS activity_at
    FROM mj LEFT JOIN hid ON hid.job_id = mj.id
    WHERE NOT mj.on_evidence
    GROUP BY mj.row_id
  ),
  st AS (
    SELECT m.row_id,
           CASE WHEN bool_or(m.status = 'running') THEN 'running'
                WHEN bool_or(m.status = 'queued') THEN 'queued'
                WHEN bool_or(m.status = 'failed') THEN 'failed'
                WHEN bool_or(m.status = 'cancelled') THEN 'cancelled'
                ELSE 'landed' END AS state
    FROM mj m
    LEFT JOIN mj r ON r.row_id = m.row_id AND r.retry_of_job_id = m.id
    WHERE r.id IS NULL AND NOT m.on_evidence
    GROUP BY m.row_id
  ),
  caps AS (
    SELECT DISTINCT mj.row_id, x.cap
    FROM mj CROSS JOIN LATERAL (VALUES (mj.capability_id), (mj.playbook_id)) AS x(cap)
    WHERE x.cap IS NOT NULL
  ),
  caps_agg AS (
    SELECT caps.row_id, array_agg(caps.cap ORDER BY caps.cap COLLATE "C") AS capability_ids
    FROM caps GROUP BY caps.row_id
  ),
  parts AS (
    SELECT ev.id AS row_id, 0 AS o1, 0::bigint AS o2, x.o3, pg_catalog.left(x.part, 500) AS part
    FROM ev CROSS JOIN LATERAL (VALUES (0, ev.label), (1, ev.notes), (2, ev.source_url)) AS x(o3, part)
    UNION ALL
    SELECT c.row_id, 1, dense_rank() OVER (PARTITION BY c.row_id ORDER BY c.cap COLLATE "C"), x.o3, x.part
    FROM caps c CROSS JOIN LATERAL (
      VALUES (0, c.cap), (1, pg_catalog.translate(c.cap, '.-_', '   '))
    ) AS x(o3, part)
    UNION ALL
    SELECT mj.row_id, 2, dense_rank() OVER (PARTITION BY mj.row_id ORDER BY mj.created_at, mj.id),
           x.o3, pg_catalog.left(x.part, 200)
    FROM mj CROSS JOIN LATERAL (
      VALUES (0, mj.result_summary), (1, mj.error), (2, mj.interpret_error),
             (3, public.collect_input_text(mj.input))
    ) AS x(o3, part)
  ),
  texts AS (
    SELECT parts.row_id,
           pg_catalog.left(pg_catalog.string_agg(parts.part, ' ' ORDER BY parts.o1, parts.o2, parts.o3), 4000) AS search_text
    FROM parts
    WHERE parts.part IS NOT NULL AND parts.part <> ''
    GROUP BY parts.row_id
  )
  SELECT ev.id, 'evidence'::text, ev.captured_at, ev.captured_at,
         CASE WHEN ev.deleted_at IS NOT NULL THEN 'hidden'
              WHEN ev.processed_at IS NULL THEN 'unprocessed'
              ELSE 'landed' END,
         ev.entity_id, coalesce(ca.capability_ids, '{}'), coalesce(tx.search_text, '')
  FROM ev
  LEFT JOIN caps_agg ca ON ca.row_id = ev.id
  LEFT JOIN texts tx ON tx.row_id = ev.id
  UNION ALL
  SELECT g.id, g.kind, coalesce(r.created_at, g.first_created), g.activity_at,
         coalesce(st.state, 'landed'), NULL::uuid,
         coalesce(ca.capability_ids, '{}'), coalesce(tx.search_text, '')
  FROM grp g
  LEFT JOIN st ON st.row_id = g.id
  LEFT JOIN public.playbook_runs r ON g.kind = 'run' AND r.id = g.id
  LEFT JOIN caps_agg ca ON ca.row_id = g.id
  LEFT JOIN texts tx ON tx.row_id = g.id
$$;
--> statement-breakpoint
-- Bring a Case's rows up to date for the keys of one transaction (or all of it with p_rebuild).
-- The caller holds the Case's advisory lock. A Case that is gone or tombstoned is left as it is:
-- nothing reads a tombstoned Case, a restore rebuilds it, and a purge clears it.
CREATE FUNCTION public.collect_queue_sync(p_case uuid, p_jobs uuid[], p_evidence uuid[], p_rebuild boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_jobs uuid[];
  v_rows uuid[];
  v_new_jobs uuid[];
  v_new_rows uuid[];
  v_mjobs uuid[];
  v_mrows uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.id = p_case AND c.deleted_at IS NULL) THEN
    RETURN;
  END IF;

  -- 1. The Jobs whose membership may have changed, and 2. the rows they were in before.
  IF p_rebuild THEN
    SELECT coalesce(array_agg(j.id), '{}') INTO v_jobs FROM public.jobs j WHERE j.case_id = p_case;
    SELECT coalesce(array_agg(x.id), '{}') INTO v_rows FROM (
      SELECT q.id FROM public.collect_queue q WHERE q.case_id = p_case
      UNION
      SELECT e.id FROM public.evidence e WHERE e.case_id = p_case
    ) x;
  ELSE
    SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_jobs FROM (
      SELECT pg_catalog.unnest(p_jobs) AS id
      UNION ALL
      SELECT je.job_id FROM public.job_evidence je
       WHERE je.evidence_id = ANY (p_evidence) AND je.case_id = p_case
      UNION ALL
      SELECT j.id FROM public.jobs j
       WHERE public.collect_input_evidence_id(j.input, 'evidenceId') = ANY (p_evidence) AND j.case_id = p_case
      UNION ALL
      SELECT j.id FROM public.jobs j
       WHERE public.collect_input_evidence_id(j.input, 'sourceEvidenceId') = ANY (p_evidence) AND j.case_id = p_case
    ) x;
    SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_rows FROM (
      SELECT m.row_id AS id FROM public.collect_queue_member m
       WHERE m.job_id = ANY (v_jobs) AND m.case_id = p_case
      UNION ALL
      SELECT pg_catalog.unnest(p_evidence)
    ) x;
  END IF;

  -- 3. Membership by difference: unchanged pairs are not written.
  SELECT coalesce(array_agg(n.job_id), '{}'), coalesce(array_agg(n.row_id), '{}')
    INTO v_new_jobs, v_new_rows
    FROM public.collect_queue_memberships(p_case, v_jobs) n;
  IF p_rebuild THEN
    DELETE FROM public.collect_queue_member m
     WHERE m.case_id = p_case
       AND NOT EXISTS (
         SELECT 1 FROM ROWS FROM (pg_catalog.unnest(v_new_jobs), pg_catalog.unnest(v_new_rows)) AS n(job_id, row_id)
          WHERE n.job_id = m.job_id AND n.row_id = m.row_id);
  ELSE
    DELETE FROM public.collect_queue_member m
     WHERE m.case_id = p_case AND m.job_id = ANY (v_jobs)
       AND NOT EXISTS (
         SELECT 1 FROM ROWS FROM (pg_catalog.unnest(v_new_jobs), pg_catalog.unnest(v_new_rows)) AS n(job_id, row_id)
          WHERE n.job_id = m.job_id AND n.row_id = m.row_id);
  END IF;
  INSERT INTO public.collect_queue_member (job_id, row_id, case_id)
  SELECT n.job_id, n.row_id, p_case
    FROM ROWS FROM (pg_catalog.unnest(v_new_jobs), pg_catalog.unnest(v_new_rows)) AS n(job_id, row_id)
   ORDER BY n.job_id, n.row_id
  ON CONFLICT DO NOTHING;

  -- 4. Rows: every row a touched Job left or joined, recomputed from its members.
  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_rows FROM (
    SELECT pg_catalog.unnest(v_rows) AS id
    UNION ALL
    SELECT pg_catalog.unnest(v_new_rows)
  ) x;
  SELECT coalesce(array_agg(m.job_id), '{}'), coalesce(array_agg(m.row_id), '{}')
    INTO v_mjobs, v_mrows
    FROM public.collect_queue_member m
   WHERE m.row_id = ANY (v_rows) AND m.case_id = p_case;

  WITH c AS MATERIALIZED (
    SELECT * FROM public.collect_queue_compute(p_case, v_rows, v_mjobs, v_mrows)
  ),
  gone AS (
    DELETE FROM public.collect_queue q
     WHERE q.case_id = p_case AND q.id = ANY (v_rows)
       AND NOT EXISTS (SELECT 1 FROM c WHERE c.id = q.id)
  )
  INSERT INTO public.collect_queue AS q
    (id, case_id, kind, sort_at, activity_at, state, entity_id, capability_ids, search_text)
  SELECT c.id, p_case, c.kind, c.sort_at, c.activity_at, c.state, c.entity_id, c.capability_ids, c.search_text
    FROM c ORDER BY c.id
  ON CONFLICT (id) DO UPDATE SET
    case_id = EXCLUDED.case_id, kind = EXCLUDED.kind, sort_at = EXCLUDED.sort_at,
    activity_at = EXCLUDED.activity_at, state = EXCLUDED.state, entity_id = EXCLUDED.entity_id,
    capability_ids = EXCLUDED.capability_ids, search_text = EXCLUDED.search_text
  WHERE (q.case_id, q.kind, q.sort_at, q.activity_at, q.state, q.entity_id, q.capability_ids, q.search_text)
        IS DISTINCT FROM
        (EXCLUDED.case_id, EXCLUDED.kind, EXCLUDED.sort_at, EXCLUDED.activity_at, EXCLUDED.state,
         EXCLUDED.entity_id, EXCLUDED.capability_ids, EXCLUDED.search_text);
END
$$;
--> statement-breakpoint
-- Recompute a whole Case under its lock (backfill, drift repair, a restore). Clears the Case's
-- stale marks that were visible before the recomputation started: a mark that commits later
-- stays for the next tick.
CREATE FUNCTION public.collect_queue_rebuild(p_case uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_stale bigint[];
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(1464091473, public.collect_queue_lock_key(p_case));
  SELECT coalesce(array_agg(s.id), '{}') INTO v_stale
    FROM public.collect_queue_stale s WHERE s.case_id = p_case;
  PERFORM public.collect_queue_sync(p_case, '{}', '{}', true);
  DELETE FROM public.collect_queue_stale s WHERE s.id = ANY (v_stale);
END
$$;
--> statement-breakpoint
-- Where the stored rows and members of a live Case differ from a recomputation. Writes nothing.
CREATE FUNCTION public.collect_queue_diff(p_case uuid)
RETURNS TABLE (diff_kind text, diff_id uuid, diff_detail text)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_jobs uuid[];
  v_ids uuid[];
  v_mjobs uuid[];
  v_mrows uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cases c WHERE c.id = p_case AND c.deleted_at IS NULL) THEN
    RETURN;
  END IF;
  SELECT coalesce(array_agg(j.id), '{}') INTO v_jobs FROM public.jobs j WHERE j.case_id = p_case;
  SELECT coalesce(array_agg(n.job_id), '{}'), coalesce(array_agg(n.row_id), '{}')
    INTO v_mjobs, v_mrows
    FROM public.collect_queue_memberships(p_case, v_jobs) n;
  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO v_ids FROM (
    SELECT e.id FROM public.evidence e WHERE e.case_id = p_case
    UNION ALL
    SELECT pg_catalog.unnest(v_mrows)
  ) x;
  RETURN QUERY
  WITH c AS (
    SELECT * FROM public.collect_queue_compute(p_case, v_ids, v_mjobs, v_mrows)
  ),
  l AS (
    SELECT q.id, q.kind, q.sort_at, q.activity_at, q.state, q.entity_id, q.capability_ids, q.search_text
      FROM public.collect_queue q WHERE q.case_id = p_case
  )
  SELECT 'row'::text, coalesce(l.id, c.id),
         pg_catalog.format('stored %s, computed %s', pg_catalog.to_jsonb(l), pg_catalog.to_jsonb(c))
    FROM c FULL JOIN l ON l.id = c.id
   WHERE (l.id, l.kind, l.sort_at, l.activity_at, l.state, l.entity_id, l.capability_ids, l.search_text)
         IS DISTINCT FROM
         (c.id, c.kind, c.sort_at, c.activity_at, c.state, c.entity_id, c.capability_ids, c.search_text)
  UNION ALL
  SELECT 'member'::text, coalesce(lm.row_id, cm.row_id),
         pg_catalog.format('job %s: stored %s, computed %s', coalesce(lm.job_id, cm.job_id),
                           lm.job_id IS NOT NULL, cm.job_id IS NOT NULL)
    FROM (SELECT m.job_id, m.row_id FROM public.collect_queue_member m WHERE m.case_id = p_case) lm
    FULL JOIN ROWS FROM (pg_catalog.unnest(v_mjobs), pg_catalog.unnest(v_mrows)) AS cm(job_id, row_id)
      ON cm.job_id = lm.job_id AND cm.row_id = lm.row_id
   WHERE lm.job_id IS NULL OR cm.job_id IS NULL;
END
$$;
--> statement-breakpoint
-- Record one changed key for this transaction's flush. The marker row makes exactly one deferred
-- event per transaction: ON CONFLICT DO NOTHING queues no second one, and a rolled-back savepoint
-- takes its marker and its keys with it, so the next key inserts the marker again. The keys table
-- is created on first use in the session, by this function, so the owner owns it.
CREATE FUNCTION public.collect_queue_mark(p_case uuid, p_job uuid, p_evidence uuid, p_rebuild boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF pg_catalog.to_regclass('pg_temp.collect_queue_keys') IS NULL THEN
    CREATE TEMP TABLE collect_queue_keys (
      case_id uuid NOT NULL, job_id uuid, evidence_id uuid, rebuild boolean NOT NULL
    );
  END IF;
  INSERT INTO public.collect_queue_tx (xid) VALUES (pg_catalog.pg_current_xact_id())
  ON CONFLICT DO NOTHING;
  INSERT INTO pg_temp.collect_queue_keys (case_id, job_id, evidence_id, rebuild)
  VALUES (p_case, p_job, p_evidence, p_rebuild);
END
$$;
--> statement-breakpoint
-- Recompute the rows the transaction's keys reach. The deferred trigger's body, and callable
-- (a test whose transaction rolls back calls it directly). Never raises: a Case that fails, a
-- lock timeout and a deadlock abort included, rolls back its own subtransaction (releasing its
-- lock) and is logged in `collect_queue_stale`, and the writer commits.
CREATE FUNCTION public.collect_queue_flush() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  k record;
  v_lock_timeout text;
  v_read_committed boolean;
BEGIN
  IF pg_catalog.to_regclass('pg_temp.collect_queue_keys') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.collect_queue_tx WHERE xid = pg_catalog.pg_current_xact_id_if_assigned();
  v_lock_timeout := pg_catalog.current_setting('lock_timeout');
  -- Under REPEATABLE READ the recomputation cannot see a rival's commit made while it waited for
  -- the lock, so such a flush also marks its Case for the tick (nothing in the app uses it).
  v_read_committed := pg_catalog.current_setting('transaction_isolation') = 'read committed';
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  FOR k IN
    SELECT q.case_id,
           coalesce(array_agg(DISTINCT q.job_id) FILTER (WHERE q.job_id IS NOT NULL), '{}') AS jobs,
           coalesce(array_agg(DISTINCT q.evidence_id) FILTER (WHERE q.evidence_id IS NOT NULL), '{}') AS evidence,
           bool_or(q.rebuild) AS rebuild
      FROM pg_temp.collect_queue_keys q
     GROUP BY q.case_id
     ORDER BY public.collect_queue_lock_key(q.case_id), q.case_id
  LOOP
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(1464091473, public.collect_queue_lock_key(k.case_id));
      PERFORM public.collect_queue_sync(k.case_id, k.jobs, k.evidence, k.rebuild);
      IF NOT v_read_committed THEN
        INSERT INTO public.collect_queue_stale (case_id, at, error)
        VALUES (k.case_id, pg_catalog.clock_timestamp(), 'flushed outside READ COMMITTED');
      END IF;
    EXCEPTION WHEN OTHERS OR query_canceled THEN
      BEGIN
        INSERT INTO public.collect_queue_stale (case_id, at, error)
        VALUES (k.case_id, pg_catalog.clock_timestamp(), SQLERRM);
      EXCEPTION WHEN OTHERS OR query_canceled THEN
        RAISE WARNING 'collect_queue: the flush of case % failed and could not be recorded: %', k.case_id, SQLERRM;
      END;
    END;
  END LOOP;
  -- A long-lived session reuses its keys table; deleted rows are pruned but never vacuumed, so a
  -- table that has grown is truncated (a new file) instead of emptied in place.
  IF pg_catalog.pg_relation_size('pg_temp.collect_queue_keys'::regclass) > 1048576 THEN
    TRUNCATE pg_temp.collect_queue_keys;
  ELSE
    DELETE FROM pg_temp.collect_queue_keys;
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', v_lock_timeout, true);
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.collect_queue_flush_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM public.collect_queue_flush();
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- Row triggers: record the old and the new key of the row (an id or Case change records both).
CREATE FUNCTION public.collect_queue_jobs_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.collect_queue_mark(NEW.case_id, NEW.id, NULL, false);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.collect_queue_mark(OLD.case_id, OLD.id, NULL, false);
  ELSE
    PERFORM public.collect_queue_mark(OLD.case_id, OLD.id, NULL, false);
    IF (NEW.case_id, NEW.id) IS DISTINCT FROM (OLD.case_id, OLD.id) THEN
      PERFORM public.collect_queue_mark(NEW.case_id, NEW.id, NULL, false);
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.collect_queue_evidence_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.collect_queue_mark(NEW.case_id, NULL, NEW.id, false);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.collect_queue_mark(OLD.case_id, NULL, OLD.id, false);
  ELSE
    PERFORM public.collect_queue_mark(OLD.case_id, NULL, OLD.id, false);
    IF (NEW.case_id, NEW.id) IS DISTINCT FROM (OLD.case_id, OLD.id) THEN
      PERFORM public.collect_queue_mark(NEW.case_id, NULL, NEW.id, false);
    END IF;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.collect_queue_job_evidence_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.collect_queue_mark(OLD.case_id, OLD.job_id, OLD.evidence_id, false);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.collect_queue_mark(NEW.case_id, NEW.job_id, NEW.evidence_id, false);
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- A run's playbook id or start time feeds its row; neither changes in the app, but a direct write
-- (a test, a repair) still reaches the projection.
CREATE FUNCTION public.collect_queue_runs_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM public.collect_queue_mark(j.case_id, j.id, NULL, false)
     FROM public.jobs j WHERE j.playbook_run_id = NEW.id;
  RETURN NULL;
END
$$;
--> statement-breakpoint
-- A restored Case was frozen while tombstoned: rebuild it.
CREATE FUNCTION public.collect_queue_case_restored() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM public.collect_queue_mark(NEW.id, NULL, NULL, true);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "collect_queue_jobs_ins_del_trg"
  AFTER INSERT OR DELETE ON public."jobs"
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_jobs_changed();
--> statement-breakpoint
-- A log flush changes only `logs` and `updated_at`, so it does not fire.
CREATE TRIGGER "collect_queue_jobs_upd_trg"
  AFTER UPDATE ON public."jobs"
  FOR EACH ROW
  WHEN ((OLD.id, OLD.case_id, OLD.status, OLD.input, OLD.capability_id, OLD.playbook_run_id,
         OLD.retry_of_job_id, OLD.result_summary, OLD.error, OLD.interpret_error, OLD.created_at,
         OLD.started_at, OLD.finished_at)
        IS DISTINCT FROM
        (NEW.id, NEW.case_id, NEW.status, NEW.input, NEW.capability_id, NEW.playbook_run_id,
         NEW.retry_of_job_id, NEW.result_summary, NEW.error, NEW.interpret_error, NEW.created_at,
         NEW.started_at, NEW.finished_at))
  EXECUTE FUNCTION public.collect_queue_jobs_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_evidence_ins_del_trg"
  AFTER INSERT OR DELETE ON public."evidence"
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_evidence_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_evidence_upd_trg"
  AFTER UPDATE ON public."evidence"
  FOR EACH ROW
  WHEN ((OLD.id, OLD.case_id, OLD.deleted_at, OLD.processed_at, OLD.entity_id, OLD.label, OLD.notes,
         OLD.source_url, OLD.captured_at)
        IS DISTINCT FROM
        (NEW.id, NEW.case_id, NEW.deleted_at, NEW.processed_at, NEW.entity_id, NEW.label, NEW.notes,
         NEW.source_url, NEW.captured_at))
  EXECUTE FUNCTION public.collect_queue_evidence_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_job_evidence_trg"
  AFTER INSERT OR UPDATE OR DELETE ON public."job_evidence"
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_job_evidence_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_runs_upd_trg"
  AFTER UPDATE ON public."playbook_runs"
  FOR EACH ROW
  WHEN ((OLD.id, OLD.playbook_id, OLD.created_at) IS DISTINCT FROM (NEW.id, NEW.playbook_id, NEW.created_at))
  EXECUTE FUNCTION public.collect_queue_runs_changed();
--> statement-breakpoint
CREATE TRIGGER "collect_queue_case_restored_trg"
  AFTER UPDATE ON public."cases"
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.collect_queue_case_restored();
--> statement-breakpoint
ALTER TABLE public."collect_queue_tx" SET UNLOGGED;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "collect_queue_flush_trg"
  AFTER INSERT ON public."collect_queue_tx"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.collect_queue_flush_trg();
--> statement-breakpoint
-- The reconcile tick's check: the live Cases to rebuild, with why. A Case is drifted when a flush
-- of it failed (`stale`); when its counts disagree (`fingerprint`: Evidence rows against Evidence,
-- member Jobs against Jobs, or a run or Job row with no member), checked for the `p_limit` live
-- Cases counted longest ago; or when a full comparison finds a difference (`diff`), for the one
-- live Case compared longest ago. A Case may be returned more than once.
CREATE FUNCTION public.collect_queue_find_drift(p_limit integer)
RETURNS TABLE (drift_case_id uuid, drift_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  c record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_diff uuid;
BEGIN
  DELETE FROM public.collect_queue_stale s
   WHERE NOT EXISTS (SELECT 1 FROM public.cases x WHERE x.id = s.case_id AND x.deleted_at IS NULL);
  RETURN QUERY SELECT DISTINCT s.case_id, 'stale'::text FROM public.collect_queue_stale s;

  FOR c IN
    SELECT x.id FROM public.cases x
      LEFT JOIN public.collect_queue_case b ON b.case_id = x.id
     WHERE x.deleted_at IS NULL
     ORDER BY b.checked_at NULLS FIRST, x.id
     LIMIT p_limit
  LOOP
    IF (SELECT count(*) FROM public.evidence e WHERE e.case_id = c.id)
         <> (SELECT count(*) FROM public.collect_queue q WHERE q.case_id = c.id AND q.kind = 'evidence')
       OR (SELECT count(*) FROM public.jobs j WHERE j.case_id = c.id)
         <> (SELECT count(DISTINCT m.job_id) FROM public.collect_queue_member m WHERE m.case_id = c.id)
       OR EXISTS (
         SELECT 1 FROM public.collect_queue q
          WHERE q.case_id = c.id AND q.kind <> 'evidence'
            AND NOT EXISTS (SELECT 1 FROM public.collect_queue_member m WHERE m.row_id = q.id))
    THEN
      drift_case_id := c.id;
      drift_reason := 'fingerprint';
      RETURN NEXT;
    END IF;
    INSERT INTO public.collect_queue_case (case_id, checked_at) VALUES (c.id, v_now)
    ON CONFLICT (case_id) DO UPDATE SET checked_at = EXCLUDED.checked_at;
  END LOOP;

  SELECT x.id INTO v_diff FROM public.cases x
    LEFT JOIN public.collect_queue_case b ON b.case_id = x.id
   WHERE x.deleted_at IS NULL
   ORDER BY b.diffed_at NULLS FIRST, x.id
   LIMIT 1;
  IF v_diff IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.collect_queue_diff(v_diff)) THEN
      drift_case_id := v_diff;
      drift_reason := 'diff';
      RETURN NEXT;
    END IF;
    INSERT INTO public.collect_queue_case (case_id, diffed_at) VALUES (v_diff, v_now)
    ON CONFLICT (case_id) DO UPDATE SET diffed_at = EXCLUDED.diffed_at;
  END IF;
END
$$;
--> statement-breakpoint
-- Internal: only triggers and the flush call these.
REVOKE ALL ON FUNCTION public.collect_queue_mark(uuid, uuid, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.collect_queue_sync(uuid, uuid[], uuid[], boolean) FROM PUBLIC;
--> statement-breakpoint
-- A Case purge clears its projection rows before the cascade, as it clears its link rows. It takes
-- no Case lock: a purge needs a tombstone committed a retention period earlier, and every flush
-- skips a tombstoned Case, so no flush writes these rows while a purge deletes them.
CREATE OR REPLACE FUNCTION public."evidence_links_before_case_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  DELETE FROM public."collect_queue_member" WHERE "case_id" = OLD."id";
  DELETE FROM public."collect_queue" WHERE "case_id" = OLD."id";
  DELETE FROM public."collect_queue_stale" WHERE "case_id" = OLD."id";
  DELETE FROM public."collect_queue_case" WHERE "case_id" = OLD."id";
  DELETE FROM public."proposal_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."job_evidence" WHERE "case_id" = OLD."id";
  DELETE FROM public."evidence_provider_calls" WHERE "case_id" = OLD."id";
  RETURN OLD;
END
$fn$;
--> statement-breakpoint
-- Backfill: every live Case. A rule change repeats this statement in its own migration.
SELECT public.collect_queue_rebuild(c.id) FROM public.cases c WHERE c.deleted_at IS NULL ORDER BY c.id;
