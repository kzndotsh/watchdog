#!/usr/bin/env bash
# Create + grant the LOCAL-ONLY read-only role `watchdog_readonly` (idempotent).
#
# Used by the dev MCP Postgres server (.mcp.json). Never run this against a
# real deployment: the password below is a fixed local-dev value, like
# `watchdog_app`'s in docker/postgres/init.sql.
#
# Usage: scripts/ensure-readonly-role.sh [database ...]   (default: watchdog)
# Connects with DATABASE_URL_MIGRATE (a superuser/owner URL; any db name in it
# is replaced). Safe to re-run: `just up`, `just readonly-role` and
# `pnpm test-db` call it AFTER migrations so tables added by a migration are
# covered. Existing containers never re-run docker/postgres/init.sql, so this
# script is also how they get the role.
#
# Privileges: CONNECT, USAGE on schemas public + auth, SELECT on their tables
# (current and, via default privileges for the migrating role, future), and
# nothing else. The credential tables below are then revoked.
# Keep that list in sync with docs/how-to/local-dev.md and
# packages/db/src/__tests__/readonly-role.int.test.ts.
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

# Credential / bearer-secret tables the read-only role must not read.
EXCLUDED_TABLES=(
  auth.account       # password hashes, OAuth access/refresh/id tokens
  auth.apikey        # API key hashes
  auth.session       # session tokens
  auth.verification  # one-time tokens and codes
  auth.invitation    # the invitation id is the accept-link secret
  public.credentials # vault ciphertext
)

DATABASES=("$@")
[[ ${#DATABASES[@]} -gt 0 ]] || DATABASES=(watchdog)

for db in "${DATABASES[@]}"; do
  psql "${BASE}/${db}" -v ON_ERROR_STOP=1 -v "db=${db}" -v "excluded=${EXCLUDED_TABLES[*]}" <<'SQL'
SELECT 'CREATE ROLE watchdog_readonly WITH LOGIN PASSWORD ''watchdog_readonly'' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_readonly')\gexec

-- Defense in depth: sessions start read-only and time-boxed. A client can undo
-- these with SET, so the grants below are the real boundary.
ALTER ROLE watchdog_readonly SET default_transaction_read_only = on;
ALTER ROLE watchdog_readonly SET statement_timeout = '30s';

GRANT CONNECT ON DATABASE :"db" TO watchdog_readonly;
GRANT USAGE ON SCHEMA public, auth TO watchdog_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public, auth TO watchdog_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO watchdog_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO watchdog_readonly;

SELECT format('REVOKE ALL ON %s FROM watchdog_readonly', t)
FROM unnest(string_to_array(:'excluded', ' ')) AS t
WHERE to_regclass(t) IS NOT NULL\gexec
SQL
done

echo "read-only role ready: watchdog_readonly on ${DATABASES[*]}"
