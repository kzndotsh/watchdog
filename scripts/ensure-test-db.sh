#!/usr/bin/env bash
# Create + migrate watchdog_test and watchdog_e2e (idempotent).
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
    CREATE ROLE watchdog_app WITH LOGIN PASSWORD 'watchdog';
  END IF;
END \$\$;
GRANT CONNECT, CREATE ON DATABASE ${name} TO watchdog_app;
GRANT USAGE, CREATE ON SCHEMA public TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO watchdog_app;
SQL
}

ensure_db watchdog_test
ensure_db watchdog_e2e

grant_app() {
  local name="$1"
  psql "${BASE}/${name}" -v ON_ERROR_STOP=1 <<SQL
GRANT USAGE, CREATE ON SCHEMA public, auth TO watchdog_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, auth TO watchdog_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, auth TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO watchdog_app;
SQL
}

DATABASE_URL_MIGRATE="${BASE}/watchdog_test" pnpm --filter @watchdog/db migrate
DATABASE_URL_MIGRATE="${BASE}/watchdog_e2e" pnpm --filter @watchdog/db migrate

grant_app watchdog_test
grant_app watchdog_e2e

# Local-only read-only role (dev MCP Postgres). After migrations so every table is covered.
bash "$ROOT/scripts/ensure-readonly-role.sh" watchdog_test watchdog_e2e

echo "test databases ready: watchdog_test, watchdog_e2e"
