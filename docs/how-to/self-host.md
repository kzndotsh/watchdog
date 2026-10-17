# Self-host with containers

**What this is:** build the web and worker images, bring up the single-host production stack, create the first admin, and send invitation mail. **What this is not:** the rest of the operator guide, which has its own pages: [`reverse-proxy`](reverse-proxy.md) (TLS and the object store's public address), [`backup-restore`](backup-restore.md) (Postgres, the object store and the vault key), [`upgrade`](upgrade.md) and the [configuration reference](../reference/platform/configuration.md). Published release images are [#310](https://github.com/kzndotsh/watchdog/issues/310); until they exist you build the images from this repository.

Development does not use any of this: [`local-dev`](local-dev.md) and the dev `docker-compose.yml` are unchanged.

## What you get

The root `Dockerfile` has two targets, built from the same pinned Node 22 (Alpine) base:

| Target   | Runs                              | Port | Migrations         |
| -------- | --------------------------------- | ---- | ------------------ |
| `web`    | the app and its API (`/api/v1/*`) | 3000 | on start (default) |
| `worker` | Cap Jobs and the Case Export      | none | skipped            |

Both images run as the unprivileged `node` user (uid 1000) and hold only Node, one bundled JavaScript file (every dependency inlined at build time) and the migrator. They have no `node_modules`, no dev dependencies and no package manager. `docker-compose.prod.yml` runs them with Postgres 18 and SeaweedFS, the same S3-compatible store as dev.

## Build

```bash
docker build --target web    -t watchdog-web .
docker build --target worker -t watchdog-worker .
```

The first build fetches the pnpm store (a few minutes); later builds reuse that layer until `pnpm-lock.yaml` changes.

## Bring up the stack

```bash
cp env.production.example .env.production   # fill in every value marked MUST CHANGE
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

`--build` builds both targets and tags them `watchdog-web:local` and `watchdog-worker:local` (override with `WATCHDOG_WEB_IMAGE` and `WATCHDOG_WORKER_IMAGE`; once release images exist, point them there and use `pull` instead of `--build`). The compose project is named `watchdog-prod`, so its volumes never collide with the dev stack's.

The file holds no secrets. A missing `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` or `BETTER_AUTH_URL` stops `up` with a message; `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY` are blank in the example and the app refuses to start without them (a web container with a bad environment stays up answering 500, and its healthcheck reports it unhealthy). Generate secrets with the `openssl` commands in `env.production.example`. Keep `WD_MASTER_VAULT_KEY` safe: without it stored Cap credentials cannot be read.

Start order, enforced by `depends_on`: Postgres and storage healthy, then `s3-init` (creates the Evidence bucket; readiness needs it), then `web` (migrates, then serves; healthy means liveness answers, which happens only after the migrations finished), then `worker`.

Check it:

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health   # liveness: {"ok":true,"service":"watchdog"}
curl -fsS http://127.0.0.1:3000/api/v1/ready    # readiness: {"ok":true,"database":"ok","storage":"ok"}
```

`/health` answers without touching Postgres or storage (the compose healthcheck uses it). `/ready` answers 200 only when both dependencies do, otherwise 503 with the reason (`timeout` or `unreachable`): use it for a load balancer.

The web port binds to `127.0.0.1` by default. Put a TLS reverse proxy in front before exposing it, and set `BETTER_AUTH_URL` to the URL users type. Evidence uploads go from the browser straight to object storage with presigned requests, so a public install also sets `S3_PUBLIC_URL` to the store's public HTTPS address (`S3_ENDPOINT` stays the internal one): see [`reverse-proxy`](reverse-proxy.md), which also covers the bucket's CORS rule.

## Secrets are checked at start

The app refuses to start with a placeholder or weak secret and names the variable in its log (a web container answers 500 and reports unhealthy). `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY` need at least 32 characters and may not be a known placeholder (`change-me...`, `secret`, `password`); `S3_SECRET_KEY` may not be a placeholder or the development default. Generate each with `openssl rand -base64 32`. The rules are listed in the [configuration reference](../reference/platform/configuration.md#how-to-read-it).

## Migrations on start

The entrypoint (`docker/entrypoint.sh`) runs `migrate.mjs` before the app starts. It applies the same migrations as `pnpm db:migrate` (same `drizzle` folder and bookkeeping table) without drizzle-kit, under a Postgres advisory lock, so two replicas starting together take turns: the second waits, then finds nothing to apply. A failing migration rolls back, prints `migrate: failed: ...` and exits non-zero **before the app listens**; with `restart: unless-stopped` the container retries until you fix it.

| Variable | Effect |
| --- | --- |
| `WD_SKIP_MIGRATIONS` | `1`, `true`, `yes` or `on` skips migrations; `0`, `false`, `no`, `off` or empty runs them; anything else exits 64. The `web` target runs them; the `worker` target defaults to skipping (its image sets `1`). |
| `DATABASE_URL_MIGRATE` | Connection URL for migrations (a role that may create schemas and tables). Falls back to `DATABASE_URL`. On this stack one Postgres user does both. |
| `WD_MIGRATIONS_DIR` | Folder of migrations. The image sets `/app/drizzle`; only tests change it. |

To migrate by hand instead, set `WD_SKIP_MIGRATIONS=1` on `web` and run the migrator once: `docker compose ... run --rm --no-deps -e WD_SKIP_MIGRATIONS=0 web true` applies pending migrations and exits.

Migrations are forward-only. Back up before upgrading: [`upgrade`](upgrade.md) has the procedure and what rollback means, [`backup-restore`](backup-restore.md) the commands.

## First admin

Registration is closed (`BETTER_AUTH_ALLOW_SIGNUP=0`) and stays closed: a fresh install is entered with a command, not by opening signup. With the stack up (so the database exists and is migrated):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm --no-deps web node bootstrap-admin.mjs --email you@example.com
```

It creates the instance admin and prints a generated password **once**: store it now (a password manager). A generated password is printed only to a terminal, so it does not end up in a pipe or a log; a script that captures it adds `--print-password` (and `-T` to `docker compose run`). The command is in the `web` image (`bootstrap-admin.mjs`, next to `serve.mjs`) because that image already holds the database client, Better Auth's password hashing and the validated environment; `run` goes through the entrypoint, so it also migrates a database that has not been migrated yet.

| Flag | Meaning |
| --- | --- |
| `--email <address>` | Sign-in email. Asked for when omitted and the terminal is interactive. |
| `--name <name>` | Display name. Default: the part of the email before the `@`. |
| `--print-password` | Print the generated password although stdout is not a terminal. Without it, the command refuses before creating anything. |
| `--password-stdin` | Read the password (at least 12 characters) from the first line of stdin instead of generating one: `printf '%s\n' "$ADMIN_PASSWORD" \| docker compose ... run --rm --no-deps -T web node bootstrap-admin.mjs --email you@example.com --password-stdin`. |

It refuses, exit code 1, and creates nothing when an instance admin already exists (it is for a fresh install; promote further admins in Settings, Users) or when the email already has an account. Two runs at once cannot both succeed.

Then sign in at `https://<your host>/auth/sign-in` and create your organization on the onboarding screen. Everyone else joins by invitation (Settings, Organization, Members). Locally the same command is `just admin --email you@example.com` ([`auth-setup`](auth-setup.md#first-admin)).

## Invitation mail

Invitations always give a copy link (Settings, Organization, Members, Copy link). To also mail it, set `SMTP_HOST` and `SMTP_FROM` in `.env.production`, and `SMTP_PORT` (default 587, STARTTLS; 465 uses implicit TLS), `SMTP_USER` and `SMTP_PASS` when the server authenticates, then recreate `web`:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d web
```

Mail is sent only when both `SMTP_HOST` and `SMTP_FROM` are set. The accept link in the mail is built from `BETTER_AUTH_URL`, so set that first. The link is never written to the logs: a log line carries only the invitation id, the organization id and a masked address (`i***@example.com`), and a failed send logs the error without the link. If mail does not arrive, check `docker compose logs web` for the send error, then use the copy link.

## Logs and files

Logs go to stdout (read them with `docker compose logs`); the NDJSON log drain writes under `/tmp/evlog` inside each container (`WD_LOG_DIR`), which the stack mounts as a tmpfs. The Case Export shadow lives in the `export_data` volume at `/data/export` (`WD_EXPORT_DIR`); web and worker both mount it, because the worker writes the exports and the web process renames or removes a Case's directory. The root filesystem of both app containers is read-only.

## How CI checks this

The `Container image` job builds both targets, scans them with Trivy and runs `docker/smoke.sh` against a real Postgres and SeaweedFS: two web replicas migrating an empty database at once, `/api/v1/ready` reaching ok, the sign-in page loading, the first-admin command creating an admin who signs in while signup stays closed (and refusing a second run), a placeholder secret stopping startup, the worker booting, non-root, a deliberately failing migration that must stop the container, and a `pg_dump` restored into an empty database (the [backup guide](backup-restore.md)'s commands). Details: [`ci-gates`](../contributing/ci-gates.md#container-image). To run the smoke test yourself, start an empty Postgres and a SeaweedFS (`mini -dir=/data`), then `WEB_IMAGE=... WORKER_IMAGE=... SMOKE_DATABASE_URL=... SMOKE_S3_ENDPOINT=... bash docker/smoke.sh` (the header of the script lists every variable; use free ports with `SMOKE_PORT`).
