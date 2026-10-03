# Local development

**What this is:** how the local stack fits together and the traps that cost time. Commands live in the root [`AGENTS.md`](../../AGENTS.md) quick reference and the `justfile`; first account and signup flow: [`auth-setup.md`](auth-setup.md).  
**What this is not:** a command cheat-sheet.

First run: `cp env.example .env`, set `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY` (`openssl rand -base64 32`), `pnpm install`, `just dev`, then create the first account ([`auth-setup.md`](auth-setup.md#bootstrap-solo-install)). `just bootstrap-hint` prints the signup checklist. Then try [`../tutorials/first-investigation.md`](../tutorials/first-investigation.md).

## Ports and processes

| Service | Address | Notes |
| --- | --- | --- |
| Web (`pnpm dev:web`) | `127.0.0.1:3000` | product app + `/api/v1` |
| Marketing site (`pnpm dev:site`) | `127.0.0.1:3001` | static Astro, no infra; `just dev` starts it too. Set `PUBLIC_APP_URL` in `.env` so Sign in / Get started point at `:3000`. Detail: [`apps/site/README.md`](../../apps/site/README.md) |
| Worker (`pnpm dev:worker`) | n/a | required for Jobs / Collect / Process; without it Jobs stay `queued` and the UI still loads |
| Postgres 18 | `127.0.0.1:5432` |  |
| S3 (SeaweedFS) | `127.0.0.1:9100` | evidence storage |

Everything binds to loopback.

## Services

- **Postgres 18**: app user from `DATABASE_URL`; migrations may use `DATABASE_URL_MIGRATE` (superuser). Compose mounts the data volume at `/var/lib/postgresql` (PG 18 Docker layout). Upgrading from 16: stop containers, remove the old `postgres_data` volume (or dump/restore), then `just up` so init scripts recreate roles and DBs.
- **S3 (SeaweedFS)**: the `s3` service in `docker-compose.yml`, single-node `mini` mode (MinIO is archived upstream). `just up` runs `s3-init` (idempotent); run `just s3-init` alone after a fresh volume if you skipped `up`. It creates the bucket and its browser-upload CORS rules with plain `curl` (SigV4); no client to install. Dev credentials are `watchdog` / `watchdog-dev-secret` (see `env.example`), so an older `.env` with MinIO-era keys needs `S3_ACCESS_KEY` / `S3_SECRET_KEY` updated. Presigned uploads send `x-amz-meta-sha256` as a signed header (SeaweedFS ignores it as a query parameter). Coming from MinIO: local evidence bytes are not migrated. Run `docker compose down --remove-orphans` (frees port 9100, keeps Postgres data), delete only the old MinIO volume (`docker volume ls | grep minio_data`, then `docker volume rm <name>`), then `just up`. Do not use `down -v`: it also deletes the Postgres volume.
- **Vault key:** rotating or losing `WD_MASTER_VAULT_KEY` makes stored Cap credentials unreadable; `just wipe` keeps auth and vault rows. Cap secrets go in Settings → Credentials, not `.env` ([`caps-boundary.md`](../reference/platform/caps-boundary.md#cap-credentials)).

## Common fixes

- **Stale Graph / inbox after experiments:** `just wipe yes`, then `just seed-demo` for the screenshot cases (sign up first; it seeds the current org).
- **Route 404 after adding files:** `routeTree.gen.ts` is generated; run `pnpm generate-routes` or restart `pnpm dev:web`.
- **Integration/e2e locally:** `just test-db` (creates `watchdog_test`, `watchdog_e2e`), then `pnpm test:integration` or `pnpm test:e2e`.
- **Desloppify (optional):** `pnpm desloppify:scan`, `:status`, `:next`. State under `.desloppify/` is gitignored; do not commit it.

## Gotchas

- `pnpm.onlyBuiltDependencies` in `package.json` is ignored on pnpm 11; build-script allowances live in `allowBuilds` in `pnpm-workspace.yaml` (esbuild, lightningcss).
- Symptom-to-fix table: [`troubleshooting.md`](troubleshooting.md).
