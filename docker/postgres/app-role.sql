-- Creates the application role `watchdog_app` (idempotent), with the password from the
-- POSTGRES_APP_PASSWORD environment variable. psql runs this file; two users:
--   * docker-compose.prod.yml mounts it into the Postgres image's init directory, so it runs once,
--     when the data volume is first created. psql is connected to POSTGRES_DB as POSTGRES_USER.
--   * docker/smoke.sh runs it against its empty database.
-- The role owns nothing and has no DDL, no CREATE and no superuser attributes. What it may do to
-- tables (SELECT, INSERT, UPDATE, DELETE, never on the audit tables) is granted by the migrator
-- after every run (packages/db/src/app-role.ts), not here, so a table added later is covered.
\getenv app_password POSTGRES_APP_PASSWORD
\if :{?app_password}
\else
  \set app_password ''
\endif
SELECT (:'app_password' <> '') AS has_password \gset
\if :has_password
\else
  DO $$ BEGIN RAISE EXCEPTION 'POSTGRES_APP_PASSWORD is not set'; END $$;
\endif
SELECT current_database() AS db \gset

SELECT format('CREATE ROLE watchdog_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') \gexec
SELECT format('ALTER ROLE watchdog_app WITH PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE :"db" TO watchdog_app;
