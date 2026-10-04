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

## Read-only database role

`watchdog_readonly` is a **local-only** login role for tools that inspect the dev database (the Postgres MCP server below). It is not the app role and never exists in a deployment: real deployments never run `docker/postgres/init.sql`, and `scripts/ensure-readonly-role.sh` is a local-dev script that exits with an error when `DATABASE_URL_MIGRATE` points at any host other than `localhost`, `127.0.0.1` or `::1`. Never point it, or `WATCHDOG_MCP_DATABASE_URL`, at a real deployment or investigation data.

|  |  |
| --- | --- |
| Login | `watchdog_readonly` / `watchdog_readonly` (fixed local-dev value, not a secret; `postgresql://watchdog_readonly:watchdog_readonly@127.0.0.1:5432/watchdog`) |
| Can | `CONNECT`; `USAGE` on schemas `public` and `auth`; `SELECT` on their tables, current and future (`ALTER DEFAULT PRIVILEGES`) |
| Cannot | `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE`, DDL, `CREATE` on any schema, anything on other schemas |
| Session defaults | `default_transaction_read_only = on`, `statement_timeout = 30s` (a client can `SET` these away; the grants are the boundary) |
| Hidden tables | `auth.account` (password hashes, OAuth tokens), `auth.apikey` (key hashes), `auth.session` (session tokens), `auth.verification` (one-time tokens), `auth.invitation` (the id is the accept link), `public.credentials` (vault ciphertext): `SELECT` on them is denied |

`auth.user` stays readable (names and emails of local accounts). A new table is readable by default; if it holds a secret, add it to `EXCLUDED_TABLES` in `scripts/ensure-readonly-role.sh` and to `packages/db/src/__tests__/readonly-role.int.test.ts`. That test fails when an unlisted table is unreadable, a listed one is readable, or a readable column is named like a password, token, secret, ciphertext or `key`.

**Creating or refreshing it:** `just up` runs `just readonly-role` after migrations, so a first run, an existing container and a new table all end up covered. Run `just readonly-role` by hand after `pnpm db:migrate` alone. A fresh volume also creates the role from `docker/postgres/init.sql`; an already-running container never re-runs that file, which is why the script is the idempotent source of truth. `pnpm test-db` (CI included) applies it to `watchdog_test` and `watchdog_e2e`.

## Agent MCP servers

`.mcp.json` (repo root) declares three dev-only MCP servers. Two start with `npx` at pinned versions (bump deliberately; `scripts/__tests__/mcp-config.gate.test.ts` rejects `latest`, ranges and unpinned packages); one is remote:

- **`postgres`** (`@yawlabs/postgres-mcp`): connects as `watchdog_readonly` to `127.0.0.1:5432/watchdog` and runs queries in `BEGIN READ ONLY`; writes stay off (`ALLOW_WRITES` unset). The connection string is `${WATCHDOG_MCP_DATABASE_URL:-<local read-only URL>}`: export that variable to use another local database (for example `watchdog_test`), always with the read-only role. Needs `just up` first.
- **`playwright`** (`@playwright/mcp`): headless, isolated profile (nothing saved to disk), scoped with `--allowed-origins` to `http://127.0.0.1:3000` / `localhost:3000` (the web dev server; edit both entries if you move the port). It is a convenience scope, not a security boundary. Install the browser once with `pnpm exec playwright install chromium`.
- **`better-auth`** (remote, `https://mcp.better-auth.com/mcp`): Better Auth's hosted documentation search, examples and setup help. Read-only, no credentials, nothing runs locally. It is unrelated to Better Auth's MCP _plugin_ (provider auth). Only the queries the agent sends leave the machine, so do not paste repo contents or secrets into them. The docs track the latest release (1.7.7 when this was written) while the repo pins 1.7.5 (`pnpm-workspace.yaml` catalog), so check an answer against the pinned version; the server can also serve a named version.

**What the agent can see.** The read-only role cannot read credential tables (`auth.account`, `auth.apikey`, `auth.session`, `auth.verification`, `auth.invitation`, `public.credentials`), and an integration test fails if a readable column looks like a password, token, secret or key and its table is not on that list. It can still read Case content (Jobs, Evidence, tasks, descriptions) and user emails and IPs, and an MCP client passes query results to the model. Point it only at a local database with data you are fine sending to the model provider, never at a database holding real investigation material.

**Supply chain.** `npx` fetches the two local servers outside the pnpm workspace, so the pins are exact versions but have no lockfile integrity hash or release-age gate. `npm_config_ignore_scripts=true` stops their install scripts from running. Bump a pin only after reading the package's changelog. A remote server is outside the pins altogether: its content can change at any time, so the test allows only `type: "http"` entries with an `https://` URL on an explicit host allowlist (today `mcp.better-auth.com`), no headers, env, command or credentials in the URL. Add a host to that allowlist deliberately.

**Claude Code** reads `.mcp.json` itself: start `claude` in the repo, approve the project servers when prompted (`/mcp` shows status; `claude mcp reset-project-choices` resets the approval). **Cursor** does not read the root `.mcp.json`: add the same entries under Settings → MCP (or a personal `.cursor/mcp.json`), keeping the pinned versions and the read-only URL; the remote one is just `"better-auth": { "url": "https://mcp.better-auth.com/mcp" }` ([Cursor MCP docs](https://cursor.com/docs/context/mcp)); Cursor's own expansion syntax is `${env:VAR}`, with no `:-default`, so write the local URL out.

## Common fixes

- **Stale Graph / inbox after experiments:** `just wipe yes`, then `just seed-demo` for the screenshot cases (sign up first; it seeds the current org).
- **Route 404 after adding files:** `routeTree.gen.ts` is generated; run `pnpm generate-routes` or restart `pnpm dev:web`.
- **Integration/e2e locally:** `just test-db` (creates `watchdog_test`, `watchdog_e2e`), then `pnpm test:integration` or `pnpm test:e2e`.
- **Desloppify (optional):** `pnpm desloppify:scan`, `:status`, `:next`. State under `.desloppify/` is gitignored; do not commit it.

## Gotchas

- `pnpm.onlyBuiltDependencies` in `package.json` is ignored on pnpm 11; build-script allowances live in `allowBuilds` in `pnpm-workspace.yaml` (esbuild, lightningcss).
- Symptom-to-fix table: [`troubleshooting.md`](troubleshooting.md).
