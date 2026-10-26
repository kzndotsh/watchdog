-- Custom migration (ADR-0007, #549): the only hand-written SQL of the list standard. The trigram
-- indexes the next, generated migration creates (`gin_trgm_ops`) need the extension first.
-- pg_trgm is a trusted extension (Postgres 13+), so the migration owner creates it without
-- superuser; docker/postgres/init.sql runs only on a fresh volume, so it cannot live there.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
