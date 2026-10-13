#!/usr/bin/env bash
# Create the dev-only pg_stat_statements extension in one database (idempotent).
#
# docker-compose.yml preloads the library (a server setting), and a fresh volume creates the
# extension from docker/postgres/init.sql. An existing volume never re-runs init.sql, so `just up`
# calls this after migrate. It is a dev script, never a migration: it exits when
# DATABASE_URL_MIGRATE points at a non-loopback host.
#
# Usage: scripts/ensure-pg-stat-statements.sh [database]   (default: watchdog)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB="${1:-watchdog}"
MIGRATE_URL="${DATABASE_URL_MIGRATE:-postgresql://postgres:postgres@127.0.0.1:5432/watchdog}"
BASE="${MIGRATE_URL%/*}"
HOST_PART="${BASE#*@}"
HOST="${HOST_PART%%[:/]*}"
case "$HOST" in
  localhost | 127.0.0.1 | "[::1]") ;;
  *)
    echo "ensure-pg-stat-statements: host '$HOST' is not loopback; dev only" >&2
    exit 1
    ;;
esac

preload="$(psql "$BASE/postgres" -Atc "SHOW shared_preload_libraries")"
if [[ "$preload" != *pg_stat_statements* ]]; then
  echo "ensure-pg-stat-statements: the server does not preload pg_stat_statements (shared_preload_libraries='$preload')." >&2
  echo "  Recreate the container so docker-compose.yml's command applies: docker compose up -d postgres" >&2
  exit 0
fi

psql "$BASE/$DB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" >/dev/null
echo "pg_stat_statements ready in $DB"
