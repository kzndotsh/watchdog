# Local development

**What this is:** `just` / docker lifecycle, wipe, test databases, MinIO, dev servers.  
**What this is not:** first-time signup ([`onboarding.md`](onboarding.md)).

## Daily workflow

| Task | Command |
| --- | --- |
| Enter toolchain | `nix develop` |
| Postgres + MinIO | `just up` |
| First-time bucket | `just minio-init` |
| Install / migrate | `pnpm install` · `pnpm db:migrate` |
| Web dev server | `pnpm dev:web` → http://127.0.0.1:3000 |
| Cap Job worker | `pnpm dev:worker` (second terminal; required for Jobs/Collect/Process) |
| Wipe case data | `just wipe` · `just wipe yes` (keeps auth + vault) |
| Test DBs | `just test-db` (`watchdog_test`, `watchdog_e2e`) |
| Stop containers | `just down` |

Copy [`env.example`](../../env.example) to `.env` before first run. Cap secrets go in Settings vault, not `.env` ([`vault-setup.md`](vault-setup.md)).

## Services

- **Postgres** — `127.0.0.1:5432`, app user from `DATABASE_URL`; migrations may use `DATABASE_URL_MIGRATE` (superuser).
- **MinIO** — S3-compatible evidence storage at `S3_ENDPOINT` (default `http://127.0.0.1:9100`). Run `just minio-init` once per fresh volume.
- **Worker** — Without `pnpm dev:worker`, Jobs stay queued; web UI still loads.

## Common fixes

- **Stale Graph / inbox after experiments:** `just wipe yes` then re-seed manually.
- **Route 404 after adding files:** `pnpm generate-routes` or restart `pnpm dev:web` (`routeTree.gen.ts` is generated).
- **Integration/e2e locally:** `just test-db` then `pnpm test:integration` or `pnpm test:e2e`.

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
