# Watchdog greenfield — local infra via just.
# `just up` = healthy Postgres + S3 (SeaweedFS) + bucket + migrations (not docker-only).

set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

# Postgres + S3 (SeaweedFS) + bucket + migrations (daily / first-run infra)
up: docker-up wait-healthy s3-init migrate

# Docker only — use when you need containers without migrate/bucket
docker-up:
    docker compose up -d postgres s3

# Block until Postgres + S3 (SeaweedFS) healthchecks pass
wait-healthy:
    @echo "Waiting for Postgres + S3 (SeaweedFS)…"
    docker compose up -d --wait postgres s3

down:
    docker compose down

migrate:
    pnpm db:migrate

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

# Infra + web + marketing site + worker (single terminal; Ctrl+C stops all)
dev: up
    bash scripts/dev.sh

# Cap Job worker only
worker:
    pnpm dev:worker

# Solo bootstrap: allow signup briefly, then sign up in the UI
bootstrap-hint:
    @echo "1. Set BETTER_AUTH_ALLOW_SIGNUP=1 in .env"
    @echo "2. pnpm dev:web → http://127.0.0.1:3000/auth/sign-up"
    @echo "3. Create the first admin account, then create your organization on /onboarding"
    @echo "4. Set BETTER_AUTH_ALLOW_SIGNUP=0, then restart pnpm dev:web"
