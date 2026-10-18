#!/usr/bin/env bash
set -euo pipefail
# Create extra databases on first volume init. Runs against POSTGRES_DB.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
SELECT 'CREATE DATABASE watchdog_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'watchdog_test')\\gexec
SELECT 'CREATE DATABASE watchdog_e2e'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'watchdog_e2e')\\gexec
SQL

for db in watchdog_test watchdog_e2e; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
GRANT CONNECT ON DATABASE ${db} TO watchdog_app;
SQL
done
