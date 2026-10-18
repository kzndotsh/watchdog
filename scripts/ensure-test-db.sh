#!/usr/bin/env bash
# Create + migrate watchdog_test and watchdog_e2e (idempotent).
#
# Same role split as dev and production: the owner (DATABASE_URL_MIGRATE) creates the databases
# and runs the migrations; the tests and the app connect as `watchdog_app`, which owns nothing
# and has only data privileges. This script creates the login and lets it connect; the grants
# (and their re-application after each migration) are the migrator's, packages/db/src/app-role.ts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

MIGRATE_URL="${DATABASE_URL_MIGRATE:-postgresql://postgres:postgres@127.0.0.1:5432/watchdog}"
BASE="${MIGRATE_URL%/*}"

ensure_db() {
  local name="$1"
  psql "$BASE/postgres" -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE DATABASE ${name}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${name}')\\gexec
SQL
  psql "${BASE}/${name}" -v ON_ERROR_STOP=1 <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') THEN
    CREATE ROLE watchdog_app WITH LOGIN PASSWORD 'watchdog'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END \$\$;
GRANT CONNECT ON DATABASE ${name} TO watchdog_app;
SQL
}

ensure_db watchdog_test
ensure_db watchdog_e2e

# The migrator installs pg-boss's schema and grants watchdog_app (see above).
DATABASE_URL_MIGRATE="${BASE}/watchdog_test" pnpm --filter @watchdog/db migrate
DATABASE_URL_MIGRATE="${BASE}/watchdog_e2e" pnpm --filter @watchdog/db migrate

# Local-only read-only role (dev MCP Postgres). After migrations so every table is covered.
bash "$ROOT/scripts/ensure-readonly-role.sh" watchdog_test watchdog_e2e

echo "test databases ready: watchdog_test, watchdog_e2e"
