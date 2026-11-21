-- Creates the application role `watchdog_app` and the worker role `watchdog_worker` (idempotent),
-- with the passwords from the POSTGRES_APP_PASSWORD and POSTGRES_WORKER_PASSWORD environment
-- variables. psql runs this file; two users:
--   * docker-compose.prod.yml mounts it into the Postgres image's init directory, so it runs once,
--     when the data volume is first created. psql is connected to POSTGRES_DB as POSTGRES_USER.
--   * docker/smoke.sh runs it against its empty database.
-- Neither role owns anything or has DDL, CREATE or superuser attributes. What they may do to tables
-- is granted by the migrator after every run (packages/server/db/src/app-role.ts), not here, so a table
-- added later is covered: the app role reads and writes rows (never the audit tables), and the
-- worker role has the same minus any write to the Graph (#720). The migrator also lets
-- watchdog_app switch to watchdog_worker for an API-key request.
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
\getenv worker_password POSTGRES_WORKER_PASSWORD
\if :{?worker_password}
\else
  \set worker_password ''
\endif
SELECT (:'worker_password' <> '') AS has_worker_password \gset
\if :has_worker_password
\else
  DO $$ BEGIN RAISE EXCEPTION 'POSTGRES_WORKER_PASSWORD is not set'; END $$;
\endif
SELECT current_database() AS db \gset

SELECT format('CREATE ROLE watchdog_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_app') \gexec
SELECT format('ALTER ROLE watchdog_app WITH PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE :"db" TO watchdog_app;

SELECT format('CREATE ROLE watchdog_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'worker_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'watchdog_worker') \gexec
SELECT format('ALTER ROLE watchdog_worker WITH PASSWORD %L', :'worker_password') \gexec
GRANT CONNECT ON DATABASE :"db" TO watchdog_worker;
