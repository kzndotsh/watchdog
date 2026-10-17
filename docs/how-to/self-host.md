# Self-host with containers

**What this is:** build the web and worker images, bring up the single-host production stack, and the first start. **What this is not:** the full operator guide (reverse proxy and TLS, backups and restore, upgrades, first-admin command, configuration reference), which is [#311](https://github.com/kzndotsh/watchdog/issues/311). Published release images are [#310](https://github.com/kzndotsh/watchdog/issues/310); until they exist you build the images from this repository.

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

The web port binds to `127.0.0.1` by default. Put a TLS reverse proxy in front before exposing it (guide: #311), and set `BETTER_AUTH_URL` to the URL users type. Evidence uploads go from the browser straight to object storage with presigned requests, so a public install also sets `S3_ENDPOINT` to the store's public URL (also #311).

## Migrations on start

The entrypoint (`docker/entrypoint.sh`) runs `migrate.mjs` before the app starts. It applies the same migrations as `pnpm db:migrate` (same `drizzle` folder and bookkeeping table) without drizzle-kit, under a Postgres advisory lock, so two replicas starting together take turns: the second waits, then finds nothing to apply. A failing migration rolls back, prints `migrate: failed: ...` and exits non-zero **before the app listens**; with `restart: unless-stopped` the container retries until you fix it.

| Variable | Effect |
| --- | --- |
| `WD_SKIP_MIGRATIONS` | `1`, `true`, `yes` or `on` skips migrations; `0`, `false`, `no`, `off` or empty runs them; anything else exits 64. The `web` target runs them; the `worker` target defaults to skipping (its image sets `1`). |
| `DATABASE_URL_MIGRATE` | Connection URL for migrations (a role that may create schemas and tables). Falls back to `DATABASE_URL`. On this stack one Postgres user does both. |
| `WD_MIGRATIONS_DIR` | Folder of migrations. The image sets `/app/drizzle`; only tests change it. |

To migrate by hand instead, set `WD_SKIP_MIGRATIONS=1` on `web` and run the migrator once: `docker compose ... run --rm --no-deps -e WD_SKIP_MIGRATIONS=0 web true` applies pending migrations and exits.

Migrations are forward-only. Back up before upgrading ([`restore-database`](restore-database.md) covers restoring).

## First start

Registration is closed by default (`BETTER_AUTH_ALLOW_SIGNUP=0`), so a fresh install has no way in yet. Until the first-admin command ships (#311), follow the solo-signup steps in [`auth-setup`](auth-setup.md): set `BETTER_AUTH_ALLOW_SIGNUP=1`, `docker compose ... up -d web`, create the account at `/auth/sign-up` (the first account is the instance admin), set it back to `0` and recreate `web`. Do this on a network only you can reach.

## Logs and files

Logs go to stdout (read them with `docker compose logs`); the NDJSON log drain writes under `/tmp/evlog` inside each container (`WD_LOG_DIR`), which the stack mounts as a tmpfs. The Case Export shadow lives in the `export_data` volume at `/data/export` (`WD_EXPORT_DIR`); web and worker both mount it, because the worker writes the exports and the web process renames or removes a Case's directory. The root filesystem of both app containers is read-only.

## How CI checks this

The `Container image` job builds both targets, scans them with Trivy and runs `docker/smoke.sh` against a real Postgres and SeaweedFS: two web replicas migrating an empty database at once, `/api/v1/ready` reaching ok, the sign-in page loading, the worker booting, non-root, and a deliberately failing migration that must stop the container. Details: [`ci-gates`](../contributing/ci-gates.md#container-image). To run the smoke test yourself, start an empty Postgres and a SeaweedFS (`mini -dir=/data`), then `WEB_IMAGE=... WORKER_IMAGE=... SMOKE_DATABASE_URL=... SMOKE_S3_ENDPOINT=... bash docker/smoke.sh` (the header of the script lists every variable; use free ports with `SMOKE_PORT`).
