-- Frozen synthetic perf dataset (#251). Run by scripts/perf-seed.sh against a PRIVATE scratch
-- database, never a shared one. Set-based (generate_series), so it loads in well under a minute.
--
-- Shape (the backend audit's, at -v div=1): 50 Cases (40 in org A, 10 in org B), 250 Entities per
-- Case (12.5k), 4 Claims / 3 Identifiers / 2 Events / 3 Questions / 1 Edge per Entity, 400 Evidence
-- per Case (20k), 1000 Jobs per Case (50k, 30-line logs), 300 Proposals per Case (15k, 20-op
-- patches), 20000 activity rows per Case (1M over 120 days), 30k Proposal and 10k Job Evidence links. `-v div=N` divides every per-Case
-- count by N for a quick smoke load; the Case count stays 50 (plus 3,600 deleted Cases, loaded last).
--
-- Frozen: no random(), now() or gen_random_uuid(). Ids are md5 of a stable key, every timestamp is
-- the fixed base below minus a hash-derived offset, and the activity xid is 0 (as for backfilled
-- rows), so two loads at the same div are byte-identical (compare `perf-seed.sh checksum`).
--
-- Database invariants (#302): Entity kinds come from the vocabulary (person, org, infra), every row
-- that hangs off an Entity carries its Case id, and Proposals and Jobs cite Evidence through the
-- link tables (each Proposal links 2 Evidence of its Case, every 5th Job links 1), with real foreign
-- keys, so the load only works on a schema that has them.
--
-- Everything is obviously synthetic: `perf-*` ids, `.invalid` addresses, placeholder text. The
-- Proposals' patches use the live patch shape on each Case's own Entities. Jobs are all finished
-- (no queued Job a worker could pick up) and carry no real Cap output.
\set ON_ERROR_STOP on
\if :{?div}
\else
  \set div 1
\endif
SELECT greatest(1, 250 / :div) AS ents, greatest(1, 400 / :div) AS evs,
       greatest(1, 1000 / :div) AS jobs, greatest(1, 300 / :div) AS props,
       greatest(1, 20000 / :div) AS acts \gset

BEGIN;

-- Deterministic helpers (session-local): a v4-shaped uuid (version and variant nibbles set, so the
-- live uuid parsers accept it) and a 0..1 fraction from a stable text key.
CREATE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT overlay(overlay(md5(k) placing '4' from 13) placing '8' from 17)::uuid $$;
CREATE FUNCTION pg_temp.frac(k text) RETURNS float8 LANGUAGE sql IMMUTABLE AS
  $$ SELECT (('x' || substr(md5(k), 1, 7))::bit(28)::int)::float8 / 268435455 $$;
-- 2026-01-01 minus up to 120 days, by key.
CREATE FUNCTION pg_temp.ts(k text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS
  $$ SELECT timestamptz '2026-01-01 00:00:00+00' - pg_temp.frac(k) * interval '120 days' $$;

-- The activity log fires pg_notify per row; a bulk load has no listeners to wake.
ALTER TABLE activity DISABLE TRIGGER activity_notify_trg;
-- Likewise the Graph history triggers: the frozen dataset is a load of rows, not a record of
-- writes, so it stays history-free (and loads without one history row per Graph row).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities', 'edges', 'identifiers', 'claims', 'events', 'questions', 'tasks'] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "AA_graph_history_row"', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['claim_evidence', 'identifier_evidence', 'edge_evidence'] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER "graph_history_link_ins_trg"', t);
  END LOOP;
END $$;

INSERT INTO auth."user" (id, name, email, created_at, updated_at)
VALUES ('perf-user', 'Perf Synthetic User', 'perf-user@example.invalid',
        timestamptz '2026-01-01 00:00:00+00', timestamptz '2026-01-01 00:00:00+00');
INSERT INTO auth.organization (id, name, slug, created_at) VALUES
  ('perf-org-a', 'Perf Org A', 'perf-org-a', timestamptz '2026-01-01 00:00:00+00'),
  ('perf-org-b', 'Perf Org B', 'perf-org-b', timestamptz '2026-01-01 00:00:00+00');
INSERT INTO auth.member (id, organization_id, user_id, role, created_at) VALUES
  ('perf-member-a', 'perf-org-a', 'perf-user', 'owner', timestamptz '2026-01-01 00:00:00+00'),
  ('perf-member-b', 'perf-org-b', 'perf-user', 'owner', timestamptz '2026-01-01 00:00:00+00');

INSERT INTO cases (id, name, slug, organization_id, created_at, updated_at)
SELECT pg_temp.uid('case-' || n), 'Perf Case ' || n, 'perf-case-' || n,
       CASE WHEN n <= 40 THEN 'perf-org-a' ELSE 'perf-org-b' END,
       pg_temp.ts('case-' || n), pg_temp.ts('case-' || n)
FROM generate_series(1, 50) AS n ORDER BY n;

INSERT INTO entities (id, case_id, kind, name, slug, summary, created_at, updated_at)
SELECT pg_temp.uid('ent-' || c.slug || '-' || n), c.id, (ARRAY['person','org','infra'])[1 + n % 3],
       'Synthetic Entity ' || n, 'entity-' || n, 'Synthetic summary ' || n,
       pg_temp.ts('ent-' || c.slug || '-' || n), pg_temp.ts('ent-' || c.slug || '-' || n)
FROM cases c CROSS JOIN LATERAL generate_series(1, :ents) AS n ORDER BY c.slug, n;

INSERT INTO claims (id, entity_id, case_id, text, confidence, created_at, updated_at)
SELECT pg_temp.uid('claim-' || e.id || '-' || k), e.id, e.case_id,
       'Synthetic claim ' || k || ' about ' || e.name || '. ' || repeat('Placeholder sentence. ', 3),
       (ARRAY['unverified','possible','confirmed'])[1 + k % 3],
       pg_temp.ts('claim-' || e.id || '-' || k), pg_temp.ts('claim-' || e.id || '-' || k)
FROM entities e CROSS JOIN generate_series(1, 4) AS k ORDER BY e.id, k;

INSERT INTO identifiers (id, entity_id, case_id, type, platform, value, confidence, created_at, updated_at)
SELECT pg_temp.uid('ident-' || e.id || '-' || k), e.id, e.case_id, (ARRAY['email','handle','phone'])[k], 'perf',
       'perf-' || e.slug || '-' || k || '@example.invalid', 'unverified',
       pg_temp.ts('ident-' || e.id || '-' || k), pg_temp.ts('ident-' || e.id || '-' || k)
FROM entities e CROSS JOIN generate_series(1, 3) AS k ORDER BY e.id, k;

INSERT INTO events (id, entity_id, case_id, "when", what, created_at, updated_at)
SELECT pg_temp.uid('event-' || e.id || '-' || k), e.id, e.case_id, '2024-01-' || lpad((k * 7)::text, 2, '0'),
       'Synthetic event ' || k || ' for ' || e.name,
       pg_temp.ts('event-' || e.id || '-' || k), pg_temp.ts('event-' || e.id || '-' || k)
FROM entities e CROSS JOIN generate_series(1, 2) AS k ORDER BY e.id, k;

INSERT INTO questions (id, entity_id, case_id, text, created_at, updated_at)
SELECT pg_temp.uid('question-' || e.id || '-' || k), e.id, e.case_id, 'Synthetic open question ' || k || ' for ' || e.name,
       pg_temp.ts('question-' || e.id || '-' || k), pg_temp.ts('question-' || e.id || '-' || k)
FROM entities e CROSS JOIN generate_series(1, 3) AS k ORDER BY e.id, k;

-- Each Entity points at the next one in its Case (a ring), so no self edge unless a Case has one Entity.
INSERT INTO edges (id, from_id, to_id, case_id, predicate, confidence, created_at, updated_at)
SELECT pg_temp.uid('edge-' || a.id), a.id, b.id, a.case_id, 'related_to', 'unverified',
       pg_temp.ts('edge-' || a.id), pg_temp.ts('edge-' || a.id)
FROM entities a
JOIN entities b ON b.case_id = a.case_id
  AND b.slug = 'entity-' || (1 + (substring(a.slug from 8)::int % :ents))
ORDER BY a.id;

-- The list filters and search need spread (ADR-0007): four kinds in turn, every other row on an
-- Entity of its Case, every third with notes, a source URL on every row (so `htt`, `www` and `com`
-- match all of them: the worst needles), one in five unprocessed and one in 25 hidden.
INSERT INTO evidence (id, case_id, entity_id, kind, label, notes, mime, text, source_url, actor_id,
                      captured_at, processed_at, deleted_at, created_at, updated_at)
SELECT pg_temp.uid('ev-' || c.slug || '-' || n), c.id,
       CASE WHEN n % 2 = 0 THEN pg_temp.uid('ent-' || c.slug || '-' || (1 + n % :ents)) END,
       (ARRAY['attestation','file','url_archive','other'])[1 + n % 4], 'Synthetic evidence ' || n,
       CASE WHEN n % 3 = 0 THEN 'Synthetic note ' || n END, 'text/plain',
       repeat('Synthetic evidence body line. ', 70),
       'https://www.example.com/perf/' || c.slug || '/' || n, 'perf-user',
       pg_temp.ts('ev-' || c.slug || '-' || n),
       CASE WHEN n % 5 <> 0 THEN pg_temp.ts('ev-' || c.slug || '-' || n) END,
       CASE WHEN n % 25 = 0 THEN pg_temp.ts('ev-' || c.slug || '-' || n) END,
       pg_temp.ts('ev-' || c.slug || '-' || n), pg_temp.ts('ev-' || c.slug || '-' || n)
FROM cases c CROSS JOIN LATERAL generate_series(1, :evs) AS n ORDER BY c.slug, n;

WITH logs AS (
  SELECT jsonb_agg(jsonb_build_object('t', i, 'level', 'info', 'msg', 'synthetic log line ' || i)) AS l
  FROM generate_series(1, 30) AS i
)
INSERT INTO jobs (id, case_id, capability_id, input, status, actor_id, logs, created_at, updated_at, finished_at)
SELECT pg_temp.uid('job-' || c.slug || '-' || n), c.id, 'perf.synthetic', jsonb_build_object('n', n),
       (ARRAY['succeeded','succeeded','succeeded','failed','cancelled'])[1 + n % 5], 'perf-user', logs.l,
       pg_temp.ts('job-' || c.slug || '-' || n), pg_temp.ts('job-' || c.slug || '-' || n),
       pg_temp.ts('job-' || c.slug || '-' || n)
FROM cases c CROSS JOIN logs CROSS JOIN LATERAL generate_series(1, :jobs) AS n ORDER BY c.slug, n;

-- Each Proposal is 20 claim-create ops on that Case's real Entities, in the live patch shape
-- (`confidence` is chosen at Accept, so it is not part of an op).
INSERT INTO proposals (id, case_id, status, patch, summary, created_by, created_at, updated_at)
SELECT pg_temp.uid('prop-' || c.slug || '-' || n), c.id, (ARRAY['pending','pending','accepted','rejected'])[1 + n % 4],
       (SELECT jsonb_agg(jsonb_build_object('op', 'create', 'resource', 'claim',
                 'id', pg_temp.uid('op-' || c.slug || '-' || n || '-' || e.slug),
                 'data', jsonb_build_object('entityId', e.id, 'class', 'observation',
                   'text', repeat('Synthetic proposed claim text. ', 6))) ORDER BY e.slug)
        FROM (SELECT id, slug FROM entities WHERE case_id = c.id ORDER BY slug LIMIT 20) AS e),
       'Synthetic proposal ' || n, 'perf-user',
       pg_temp.ts('prop-' || c.slug || '-' || n), pg_temp.ts('prop-' || c.slug || '-' || n)
FROM cases c CROSS JOIN LATERAL generate_series(1, :props) AS n ORDER BY c.slug, n;

-- Evidence links: each Proposal cites 2 Evidence of its Case, every 5th Job cites 1 (a repeat id at
-- tiny scale is skipped by the conflict clause).
INSERT INTO proposal_evidence (proposal_id, evidence_id, case_id, position)
SELECT pg_temp.uid('prop-' || c.slug || '-' || n), pg_temp.uid('ev-' || c.slug || '-' || (1 + (n + k) % :evs)), c.id, k
FROM cases c CROSS JOIN LATERAL generate_series(1, :props) AS n CROSS JOIN generate_series(0, 1) AS k
ORDER BY c.slug, n, k
ON CONFLICT DO NOTHING;

INSERT INTO job_evidence (job_id, evidence_id, case_id, position)
SELECT pg_temp.uid('job-' || c.slug || '-' || n), pg_temp.uid('ev-' || c.slug || '-' || (1 + n % :evs)), c.id, 0
FROM cases c CROSS JOIN LATERAL generate_series(1, :jobs) AS n
WHERE n % 5 = 0
ORDER BY c.slug, n;

INSERT INTO activity (xid, case_id, kind, action, subject_id, group_id, label, actor_id, created_at)
SELECT '0'::xid8, c.id, (ARRAY['task','job','evidence','proposal'])[1 + n % 4],
       (ARRAY['created','succeeded','captured','accepted'])[1 + n % 4],
       pg_temp.uid('act-s-' || c.slug || '-' || n), pg_temp.uid('act-g-' || c.slug || '-' || n),
       'Synthetic activity ' || n, 'perf-user', pg_temp.ts('act-' || c.slug || '-' || n)
FROM cases c CROSS JOIN LATERAL generate_series(1, :acts) AS n ORDER BY c.slug, n;

-- Deleted Cases (the list standard's organization-wide list): 3,000 tombstones in org A and 600 in
-- org B, after every per-Case load above so none of them carries rows. One in ten has begun its
-- purge (one in thirty of those has failed). `purge_after` is 30 days after the deletion.
INSERT INTO cases (id, name, slug, organization_id, deleted_at, deleted_by, purge_after,
                   purge_started_at, purge_error, created_at, updated_at)
SELECT pg_temp.uid('dcase-' || n), 'Perf Deleted Case ' || n, 'perf-deleted-case-' || n,
       CASE WHEN n <= 3000 THEN 'perf-org-a' ELSE 'perf-org-b' END,
       pg_temp.ts('dcase-' || n), 'perf-user', pg_temp.ts('dcase-' || n) + interval '30 days',
       CASE WHEN n % 10 = 0 THEN pg_temp.ts('dcase-' || n) + interval '1 day' END,
       CASE WHEN n % 30 = 0 THEN 'synthetic purge failure' END,
       pg_temp.ts('dcase-' || n), pg_temp.ts('dcase-' || n)
FROM generate_series(1, 3600) AS n ORDER BY n;

ALTER TABLE activity ENABLE TRIGGER activity_notify_trg;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities', 'edges', 'identifiers', 'claims', 'events', 'questions', 'tasks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "AA_graph_history_row"', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['claim_evidence', 'identifier_evidence', 'edge_evidence'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER "graph_history_link_ins_trg"', t);
  END LOOP;
END $$;
COMMIT;

VACUUM ANALYZE;

\echo
\echo 'Row counts and sizes'
SELECT relname AS "table", n_live_tup AS rows, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND n_live_tup > 0
ORDER BY pg_total_relation_size(relid) DESC;
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
