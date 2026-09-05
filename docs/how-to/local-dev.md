# Local development

**What this is:** `just` / docker lifecycle, wipe, test databases, MinIO, dev servers.  
**What this is not:** first-time signup ([`onboarding.md`](onboarding.md)).

## Daily workflow

| Task | Command |
| --- | --- |
| Enter toolchain | `nix develop` |
| Infra (Postgres + MinIO + bucket + migrate) | `just up` |
| Full stack (infra + web + worker) | `just dev` |
| Containers only | `just docker-up` |
| Install | `pnpm install` |
| Web only | `pnpm dev:web` → http://127.0.0.1:3000 |
| Worker only | `pnpm dev:worker` (required for Jobs/Collect/Process) |
| Wipe case data | `just wipe` · `just wipe yes` (keeps auth including organizations + vault) |
| Test DBs | `just test-db` (`watchdog_test`, `watchdog_e2e`) |
| Stop containers | `just down` |

Copy [`env.example`](../../env.example) to `.env` before first run. Cap secrets go in Settings vault, not `.env` ([`vault-setup.md`](vault-setup.md)).

## Services

- **Postgres 18** — `127.0.0.1:5432`, app user from `DATABASE_URL`; migrations may use `DATABASE_URL_MIGRATE` (superuser). Compose mounts the data volume at `/var/lib/postgresql` (PG 18 Docker layout). Upgrading from 16: stop containers, remove the old `postgres_data` volume (or dump/restore if you need data), then `just up` so init scripts recreate roles/DBs.
- **MinIO** — S3-compatible evidence storage at `S3_ENDPOINT` (default `http://127.0.0.1:9100`). `just up` runs `minio-init` (idempotent); use `just minio-init` alone after a fresh volume if you skipped `up`. Bucket create uses host `mc` when present, otherwise `docker run minio/mc` (no `nix develop` required for this step).
- **Worker** — Without `pnpm dev:worker`, Jobs stay queued; web UI still loads.

## Common fixes

- **Stale Graph / inbox after experiments:** `just wipe yes` then re-seed manually.
- **Route 404 after adding files:** `pnpm generate-routes` or restart `pnpm dev:web` (`routeTree.gen.ts` is generated).
- **Integration/e2e locally:** `just test-db` then `pnpm test:integration` or `pnpm test:e2e`.
- **Desloppify (optional local hygiene):** `pnpm desloppify:scan` (bootstrap excludes first); `pnpm desloppify:status` / `pnpm desloppify:next`. State under `.desloppify/` is gitignored — do not commit it.

## Next steps

| Goal | Doc |
| --- | --- |
| First investigation tutorial | [`../tutorials/first-investigation.md`](../tutorials/first-investigation.md) |
| Symptom → fix | [`troubleshooting.md`](troubleshooting.md) |

## Gotchas

- `@tanstack/devtools-vite` skill text still says Vite ^6 \|\| ^7; CLI ships **Vite 8**: builds succeed; watch for plugin warnings.
- `pnpm.onlyBuiltDependencies` in package.json is ignored on pnpm 11: use `allowBuilds` in `pnpm-workspace.yaml` (esbuild, lightningcss).
- Do not invent Next.js patterns (`app/` router, `"use server"`, etc.).
- `routeTree.gen.ts` is generated: run `pnpm generate-routes` or `pnpm dev` after route file changes.
