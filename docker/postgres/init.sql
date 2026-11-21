-- Watchdog greenfield Postgres init
-- Better Auth → auth schema; product tables → public

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Dev query statistics (docker-compose.yml preloads the library). Never a migration: production
-- Postgres is not ours to configure. scripts/ensure-pg-stat-statements.sh covers existing volumes.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE SCHEMA IF NOT EXISTS auth;

-- Application role. The stack runs the web app as `watchdog_app`; this init (and every
-- migration run after it) is done by the owner, the `postgres` superuser, which owns every table.
-- The role has no DDL, no ownership and no CREATE anywhere. Its table grants (DML only, none on
-- the append-only audit tables) are applied by the migrator after each run (packages/server/db/src/
-- app-role.ts), so this file only creates the login and lets it connect. Fixed local-dev password;
-- production sets its own (docker/postgres/app-role.sql).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') THEN
        CREATE ROLE watchdog_app WITH LOGIN PASSWORD 'watchdog'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

GRANT CONNECT ON DATABASE watchdog TO watchdog_app;

-- Worker role (#720): the worker logs in as `watchdog_worker`, which has the application role's
-- privileges except any write to the Graph (applied by the migrator, like the app role's, which
-- also lets `watchdog_app` switch to it for an API-key request). Fixed local-dev password;
-- production sets its own (docker/postgres/app-role.sql).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_worker') THEN
        CREATE ROLE watchdog_worker WITH LOGIN PASSWORD 'watchdog'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

GRANT CONNECT ON DATABASE watchdog TO watchdog_worker;

-- Local-only read-only role for the dev MCP Postgres server (.mcp.json).
-- scripts/ensure-readonly-role.sh (run by `just up` after migrations) is the
-- idempotent source of truth: it also covers existing containers, re-grants
-- after each migration and revokes the credential tables. Never create this
-- role in a real deployment.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_readonly') THEN
        CREATE ROLE watchdog_readonly WITH LOGIN PASSWORD 'watchdog_readonly'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END $$;

ALTER ROLE watchdog_readonly SET default_transaction_read_only = on;
ALTER ROLE watchdog_readonly SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE watchdog TO watchdog_readonly;
GRANT USAGE ON SCHEMA public, auth TO watchdog_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO watchdog_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO watchdog_readonly;
