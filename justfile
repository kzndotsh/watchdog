# Watchdog greenfield — local infra via just.
# `just up` = healthy Postgres + S3 (SeaweedFS) + bucket + migrations (not docker-only).
# Two database roles, as in production: the app connects as watchdog_app (DATABASE_URL: data
# privileges only); migrations, `admin`, `vault-rekey` and `wipe` run as the owner
# (DATABASE_URL_MIGRATE: the postgres superuser).

set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

# Postgres + S3 (SeaweedFS) + bucket + migrations (daily / first-run infra)
up: docker-up wait-healthy s3-init migrate readonly-role pg-stat-statements

# Docker only — use when you need containers without migrate/bucket
docker-up:
    docker compose up -d postgres s3

# Block until Postgres + S3 (SeaweedFS) healthchecks pass
wait-healthy:
    @echo "Waiting for Postgres + S3 (SeaweedFS)…"
    docker compose up -d --wait postgres s3

down:
    docker compose down

# As the owner (DATABASE_URL_MIGRATE); also installs pg-boss's schema and re-grants watchdog_app
migrate:
    pnpm db:migrate

# Local-only read-only Postgres role for the dev MCP server (idempotent; `up` runs it after migrate)
readonly-role:
    bash scripts/ensure-readonly-role.sh watchdog

# Dev-only query statistics: create pg_stat_statements in `watchdog` (idempotent; `up` runs it)
pg-stat-statements:
    bash scripts/ensure-pg-stat-statements.sh watchdog

s3-init:
    bash scripts/s3-init.sh

# Empty Case Graph / Jobs / Inbox / Evidence. Keeps auth (including orgs) + vault. `just wipe yes` skips prompt.
wipe *args:
    bash scripts/wipe-case-data.sh {{args}}

# Fictional cases for product screenshots. `just seed-demo --force` replaces them.
seed-demo *args:
    pnpm seed:demo -- {{args}}

# Create + migrate watchdog_test / watchdog_e2e
test-db:
    bash scripts/ensure-test-db.sh

# Frozen synthetic perf dataset (50 Cases, 12.5k entities, 50k Jobs, 15k Proposals, 1M activity rows) in a
# private scratch database (wd_perf_*; never dev/test/e2e). `PERF_SEED_DIV=100 just perf-seed` = quick smoke load.
perf-seed db="wd_perf_seed":
    bash scripts/perf-seed.sh up {{quote(db)}}

# Drop a scratch database made by perf-seed
perf-seed-drop db="wd_perf_seed":
    bash scripts/perf-seed.sh down {{quote(db)}}

# Infra + web + marketing site + worker (single terminal; Ctrl+C stops all)
dev: up
    bash scripts/dev.sh

# Cap Job worker only
worker:
    pnpm dev:worker

# Create .env from env.example with generated secrets (never overwrites an existing .env)
env:
    bash scripts/init-env.sh

# First instance admin without opening signup: `just admin --email you@example.com`
# (a password is generated and printed once; `--password-stdin` reads one). Refuses when an admin exists.
# Runs as the owner role (DATABASE_URL_MIGRATE).
admin *args:
    DATABASE_URL="${DATABASE_URL_MIGRATE:-${DATABASE_URL:-}}" pnpm admin:bootstrap {{args}}

# Rotate the vault master key: re-encrypt every stored credential from the old key to the
# WD_MASTER_VAULT_KEY in .env, all or nothing. `WD_MASTER_VAULT_KEY_OLD=<old key> just vault-rekey`
# (or `--old-key-stdin`). Back up the database first. Runs as the owner role (DATABASE_URL_MIGRATE).
vault-rekey *args:
    DATABASE_URL="${DATABASE_URL_MIGRATE:-${DATABASE_URL:-}}" pnpm vault:rekey {{args}}
