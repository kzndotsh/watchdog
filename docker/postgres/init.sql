-- Watchdog greenfield Postgres init
-- Better Auth → auth schema; product tables → public

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') THEN
        CREATE ROLE watchdog_app WITH LOGIN PASSWORD 'watchdog';
    END IF;
END $$;

GRANT CONNECT ON DATABASE watchdog TO watchdog_app;
GRANT CREATE ON DATABASE watchdog TO watchdog_app;
GRANT USAGE, CREATE ON SCHEMA public, auth TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO watchdog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE ON SEQUENCES TO watchdog_app;

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
