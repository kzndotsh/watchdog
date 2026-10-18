#!/usr/bin/env bash
# Frozen synthetic perf dataset in a PRIVATE scratch database (#251).
#
#   scripts/perf-seed.sh up       [db]   create + migrate + load (default db: wd_perf_seed)
#   scripts/perf-seed.sh down     [db]   drop it
#   scripts/perf-seed.sh checksum [db]   md5 per seeded table (two loads at the same div match)
#
# `just perf-seed [db]` / `just perf-seed-drop [db]` wrap these. `PERF_SEED_DIV=N` divides every
# per-Case row count by N for a quick smoke load (default 1 = the audit's shape: 50 Cases, 12.5k
# entities, 50k Jobs, 15k Proposals, 1M activity rows).
#
# Safety: the database name must match wd_perf_[a-z0-9_]+ (a private scratch namespace), which
# also rules out every URI delimiter and quote, and must not be one of the databases the app,
# tests and e2e use. The name reaches SQL only as a psql variable (`:"db"`, identifier-quoted).
# The host must be loopback. Connects with DATABASE_URL_MIGRATE (a superuser URL; any db name in
# it is replaced).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CMD="${1:-}"
NAME="${2:-wd_perf_seed}"
DIV="${PERF_SEED_DIV:-1}"

PROTECTED=(postgres template0 template1 watchdog watchdog_test watchdog_e2e watchdog_e2e_s6 watchdog_s6)
for p in "${PROTECTED[@]}"; do
  if [[ "$NAME" == "$p" ]]; then
    echo "perf-seed: refusing protected database '$NAME'" >&2
    exit 1
  fi
done
if [[ ! "$NAME" =~ ^wd_perf_[a-z0-9_]+$ ]]; then
  echo "perf-seed: database name must match wd_perf_[a-z0-9_]+ (got '$NAME')" >&2
  exit 1
fi
if [[ ! "$DIV" =~ ^[1-9][0-9]*$ ]]; then
  echo "perf-seed: PERF_SEED_DIV must be a positive integer (got '$DIV')" >&2
  exit 1
fi

# Parse DATABASE_URL_MIGRATE: drop the scheme, then the path / query / fragment, then the
# userinfo, so `postgresql://127.0.0.1@evil.example/db` is judged by `evil.example`.
MIGRATE_URL="${DATABASE_URL_MIGRATE:-postgresql://postgres:postgres@127.0.0.1:5432/watchdog}"
authority="${MIGRATE_URL#*://}"
authority="${authority%%/*}"
authority="${authority%%\?*}"
authority="${authority%%#*}"
hostport="${authority##*@}"
userinfo=""
if [[ "$authority" == *@* ]]; then userinfo="${authority%@*}@"; fi
case "$hostport" in
  \[*\]*) host="${hostport%%]*}]" ;;
  *) host="${hostport%%:*}" ;;
esac
case "$host" in
  localhost | 127.0.0.1 | "[::1]") ;;
  *)
    echo "perf-seed: host '$host' is not loopback; scratch seeds are local only" >&2
    exit 1
    ;;
esac
BASE="postgresql://${userinfo}${hostport}"

case "$CMD" in
  up)
    exists="$(psql "$BASE/postgres" -v "db=$NAME" -At <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'db'
SQL
)"
    if [[ -n "$exists" ]]; then
      echo "perf-seed: '$NAME' already exists; run 'scripts/perf-seed.sh down $NAME' first" >&2
      exit 1
    fi
    psql "$BASE/postgres" -v ON_ERROR_STOP=1 -v "db=$NAME" <<'SQL'
CREATE DATABASE :"db"
SQL
    psql "$BASE/$NAME" -v ON_ERROR_STOP=1 -v "db=$NAME" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') THEN
    CREATE ROLE watchdog_app WITH LOGIN PASSWORD 'watchdog';
  END IF;
END $$;
GRANT CONNECT, CREATE ON DATABASE :"db" TO watchdog_app;
SQL
    # Query statistics for the scratch DB when the server preloads the library (see local-dev.md).
    preload="$(psql "$BASE/postgres" -At <<'SQL'
SHOW shared_preload_libraries
SQL
)"
    if [[ "$preload" == *pg_stat_statements* ]]; then
      psql "$BASE/$NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements
SQL
    fi
    DATABASE_URL_MIGRATE="$BASE/$NAME" pnpm --filter @watchdog/db migrate
    psql "$BASE/$NAME" -v ON_ERROR_STOP=1 -v "div=$DIV" -f scripts/perf-seed/seed.sql
    DATABASE_URL_MIGRATE="$BASE/$NAME" pnpm --filter @watchdog/db exec tsx scripts/check-seed-patches.ts
    psql "$BASE/$NAME" -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public, auth TO watchdog_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, auth TO watchdog_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, auth TO watchdog_app;
SQL
    echo "perf-seed: '$NAME' ready (div=$DIV). Point DATABASE_URL at postgresql://watchdog_app:watchdog@${hostport}/${NAME} to use it; drop with: scripts/perf-seed.sh down $NAME"
    ;;
  down)
    psql "$BASE/postgres" -v ON_ERROR_STOP=1 -v "db=$NAME" <<'SQL'
DROP DATABASE IF EXISTS :"db" WITH (FORCE)
SQL
    echo "perf-seed: '$NAME' dropped"
    ;;
  checksum)
    psql "$BASE/$NAME" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT t || ' ' || count || ' ' || md5
FROM (
  SELECT 'cases' AS t, count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM cases x UNION ALL
  SELECT 'entities', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM entities x UNION ALL
  SELECT 'claims', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM claims x UNION ALL
  SELECT 'identifiers', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM identifiers x UNION ALL
  SELECT 'events', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM events x UNION ALL
  SELECT 'questions', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM questions x UNION ALL
  SELECT 'edges', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM edges x UNION ALL
  SELECT 'evidence', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM evidence x UNION ALL
  SELECT 'jobs', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM jobs x UNION ALL
  SELECT 'proposals', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM proposals x UNION ALL
  SELECT 'proposal_evidence', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM proposal_evidence x UNION ALL
  SELECT 'job_evidence', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM job_evidence x UNION ALL
  SELECT 'activity', count(*), md5(string_agg(x::text, '' ORDER BY x::text)) FROM activity x
) AS sums
ORDER BY t
SQL
    ;;
  *)
    echo "usage: scripts/perf-seed.sh up|down|checksum [db]   (db defaults to wd_perf_seed)" >&2
    exit 2
    ;;
esac
