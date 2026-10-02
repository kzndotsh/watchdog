# Local development

**What this is:** `just` / docker lifecycle, wipe, test databases, S3 storage, dev servers.  
**What this is not:** first-time signup ([`onboarding.md`](onboarding.md)).

## Daily workflow

| Task | Command |
| --- | --- |
| Enter toolchain | `nix develop` |
| Infra (Postgres + S3 + bucket + migrate) | `just up` |
| Full stack (infra + web + marketing site + worker) | `just dev` |
| Containers only | `just docker-up` |
| Install | `pnpm install` |
| Web only | `pnpm dev:web` → http://127.0.0.1:3000 |
| Marketing site only | `pnpm dev:site` → http://127.0.0.1:3001 (`just dev` starts it too; it needs no infra) |
| Worker only | `pnpm dev:worker` (required for Jobs/Collect/Process) |
| Wipe case data | `just wipe` · `just wipe yes` (keeps auth including organizations + vault) |
| Screenshot seed | `just seed-demo` · `just seed-demo --force` (fictional cases in the current org; sign up first) |
| Test DBs | `just test-db` (`watchdog_test`, `watchdog_e2e`) |
| Stop containers | `just down` |

Copy [`env.example`](../../env.example) to `.env` before first run. Cap secrets go in Settings vault, not `.env` ([`vault-setup.md`](vault-setup.md)).

**Marketing site (`apps/site`):** static Astro landing at `:3001`; also started by `just dev`. Set `PUBLIC_APP_URL` in root `.env` (see `env.example`) so **Sign in** / **Get started** point at the product app (`:3000` locally). Build: `pnpm build:site`. Detail: [`../../apps/site/README.md`](../../apps/site/README.md).

## Services

- **Postgres 18** — `127.0.0.1:5432`, app user from `DATABASE_URL`; migrations may use `DATABASE_URL_MIGRATE` (superuser). Compose mounts the data volume at `/var/lib/postgresql` (PG 18 Docker layout). Upgrading from 16: stop containers, remove the old `postgres_data` volume (or dump/restore if you need data), then `just up` so init scripts recreate roles/DBs.
- **S3 (SeaweedFS)** — S3-compatible evidence storage at `S3_ENDPOINT` (default `http://127.0.0.1:9100`), the `s3` service in `docker-compose.yml` running SeaweedFS in single-node `mini` mode (MinIO is archived upstream and its images are gone). `just up` runs `s3-init` (idempotent); use `just s3-init` alone after a fresh volume if you skipped `up`. It creates the bucket and its browser-upload CORS rules with plain `curl` (SigV4), so there is no client to install. Admin credentials come from the `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` variables in the compose file; the dev default `minioadmin` is kept so existing `.env` files keep working. Presigned uploads send `x-amz-meta-sha256` as a signed header (SeaweedFS ignores it as a query parameter). Coming from the old MinIO volume: local evidence bytes are not migrated; run `docker compose down -v` once, then `just up`.
- **Worker** — Without `pnpm dev:worker`, Jobs stay queued; web UI still loads.

## Common fixes

- **Stale Graph / inbox after experiments:** `just wipe yes`, then `just seed-demo` if you want the screenshot cases back.
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
