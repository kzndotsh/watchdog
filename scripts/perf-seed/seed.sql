-- Frozen synthetic perf dataset (#251). Run by scripts/perf-seed.sh against a PRIVATE scratch
-- database, never a shared one. Set-based (generate_series), so it loads in well under a minute.
--
-- Shape (the backend audit's, at -v div=1): 50 Cases (40 in org A, 10 in org B), 250 Entities per
-- Case (12.5k), 4 Claims / 3 Identifiers / 2 Events / 3 Questions / 1 Edge per Entity, 400 Evidence
-- per Case (20k), 1000 Jobs per Case (50k, 30-line logs), 300 Proposals per Case (15k, 20-op
-- patches), 20000 activity rows per Case (1M over 120 days). `-v div=N` divides every per-Case
-- count by N for a quick smoke load; the Case count stays 50.
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

-- The activity log fires pg_notify per row; a bulk load has no listeners to wake.
ALTER TABLE activity DISABLE TRIGGER activity_notify_trg;

INSERT INTO auth."user" (id, name, email)
VALUES ('perf-user', 'Perf Synthetic User', 'perf-user@example.invalid');
INSERT INTO auth.organization (id, name, slug, created_at) VALUES
  ('perf-org-a', 'Perf Org A', 'perf-org-a', now()),
  ('perf-org-b', 'Perf Org B', 'perf-org-b', now());
INSERT INTO auth.member (id, organization_id, user_id, role, created_at) VALUES
  ('perf-member-a', 'perf-org-a', 'perf-user', 'owner', now()),
  ('perf-member-b', 'perf-org-b', 'perf-user', 'owner', now());

INSERT INTO cases (name, slug, organization_id)
SELECT 'Perf Case ' || n, 'perf-case-' || n, CASE WHEN n <= 40 THEN 'perf-org-a' ELSE 'perf-org-b' END
FROM generate_series(1, 50) AS n;

INSERT INTO entities (case_id, kind, name, slug, summary)
SELECT c.id, (ARRAY['person','organization','place','asset'])[1 + n % 4],
       'Synthetic Entity ' || n, 'entity-' || n, 'Synthetic summary ' || n
FROM cases c CROSS JOIN LATERAL generate_series(1, :ents) AS n;

INSERT INTO claims (entity_id, text, confidence)
SELECT e.id, 'Synthetic claim ' || k || ' about ' || e.name || '. ' || repeat('Placeholder sentence. ', 3),
       (ARRAY['unverified','possible','confirmed'])[1 + k % 3]
FROM entities e CROSS JOIN generate_series(1, 4) AS k;

INSERT INTO identifiers (entity_id, type, platform, value, confidence)
SELECT e.id, (ARRAY['email','handle','phone'])[k], 'perf', 'perf-' || e.slug || '-' || k || '@example.invalid',
       'unverified'
FROM entities e CROSS JOIN generate_series(1, 3) AS k;

INSERT INTO events (entity_id, "when", what)
SELECT e.id, '2024-01-' || lpad((k * 7)::text, 2, '0'), 'Synthetic event ' || k || ' for ' || e.name
FROM entities e CROSS JOIN generate_series(1, 2) AS k;

INSERT INTO questions (entity_id, text)
SELECT e.id, 'Synthetic open question ' || k || ' for ' || e.name
FROM entities e CROSS JOIN generate_series(1, 3) AS k;

-- Each Entity points at the next one in its Case (a ring), so no self edge unless a Case has one Entity.
INSERT INTO edges (from_id, to_id, predicate, confidence)
SELECT a.id, b.id, 'related_to', 'unverified'
FROM entities a
JOIN entities b ON b.case_id = a.case_id
  AND b.slug = 'entity-' || (1 + (substring(a.slug from 8)::int % :ents));

INSERT INTO evidence (case_id, kind, label, mime, text, actor_id, captured_at)
SELECT c.id, 'attestation', 'Synthetic evidence ' || n, 'text/plain',
       repeat('Synthetic evidence body line. ', 70), 'perf-user', now() - (random() * interval '120 days')
FROM cases c CROSS JOIN LATERAL generate_series(1, :evs) AS n;

WITH logs AS (
  SELECT jsonb_agg(jsonb_build_object('t', i, 'level', 'info', 'msg', 'synthetic log line ' || i)) AS l
  FROM generate_series(1, 30) AS i
)
INSERT INTO jobs (case_id, capability_id, input, status, actor_id, logs, created_at, updated_at, finished_at)
SELECT c.id, 'perf.synthetic', jsonb_build_object('n', n),
       (ARRAY['succeeded','succeeded','succeeded','failed','cancelled'])[1 + n % 5], 'perf-user', logs.l,
       now() - (random() * interval '120 days'), now(), now()
FROM cases c CROSS JOIN logs CROSS JOIN LATERAL generate_series(1, :jobs) AS n;

-- Each Proposal is 20 claim-create ops on that Case's real Entities, in the live patch shape.
INSERT INTO proposals (case_id, status, patch, summary, created_by, created_at, updated_at)
SELECT c.id, (ARRAY['pending','pending','accepted','rejected'])[1 + n % 4],
       (SELECT jsonb_agg(jsonb_build_object('op', 'create', 'resource', 'claim', 'id', gen_random_uuid(),
                 'data', jsonb_build_object('entityId', e.id, 'class', 'observation', 'confidence', 'unverified',
                   'text', repeat('Synthetic proposed claim text. ', 6))))
        FROM (SELECT id FROM entities WHERE case_id = c.id ORDER BY slug LIMIT 20) AS e),
       'Synthetic proposal ' || n, 'perf-user', now() - (random() * interval '120 days'), now()
FROM cases c CROSS JOIN LATERAL generate_series(1, :props) AS n;

INSERT INTO activity (case_id, kind, action, subject_id, group_id, label, actor_id, created_at)
SELECT c.id, (ARRAY['task','job','evidence','proposal'])[1 + n % 4],
       (ARRAY['created','succeeded','captured','accepted'])[1 + n % 4],
       gen_random_uuid(), gen_random_uuid(), 'Synthetic activity ' || n, 'perf-user',
       now() - (random() * interval '120 days')
FROM cases c CROSS JOIN LATERAL generate_series(1, :acts) AS n;

ALTER TABLE activity ENABLE TRIGGER activity_notify_trg;
COMMIT;

VACUUM ANALYZE;

\echo
\echo 'Row counts and sizes'
SELECT relname AS "table", n_live_tup AS rows, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND n_live_tup > 0
ORDER BY pg_total_relation_size(relid) DESC;
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;
