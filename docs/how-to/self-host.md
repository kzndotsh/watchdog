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

## Security headers and cross-origin access

The web app sends the same browser security headers on every response (pages, `/api/*`, the live-update stream). They need no configuration; two settings decide what they name:

| Setting | Used for |
| --- | --- |
| `S3_ENDPOINT` | The object store's origin is the only extra origin the page may connect to (presigned uploads) and load images from (Evidence previews). Set it to the URL browsers reach, as above. |
| `BETTER_AUTH_URL` | When it is an `https` URL, `Strict-Transport-Security` is sent on every response, which is what you want behind a TLS proxy. A request that is itself `https` also gets it. `X-Forwarded-Proto` is not trusted for this. |

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; `script-src 'self' 'nonce-<per request>' 'wasm-unsafe-eval'`; `style-src 'self' 'nonce-<per request>'`; `style-src-attr 'unsafe-inline'`; `img-src 'self' data: blob: <S3 origin>`; `font-src 'self' data:`; `connect-src 'self' <S3 origin>`; `media-src 'none'`; `frame-src 'none'`; `worker-src 'self'`; `manifest-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `report-uri /api/csp-report`; `report-to csp` |
| `Reporting-Endpoints` | `csp="/api/csp-report"` |
| `Strict-Transport-Security` | `max-age=31536000` (https installs only; no `includeSubDomains` or `preload`: add those at your proxy if you want them) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` (the legacy twin of `frame-ancestors 'none'`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, USB, serial, Bluetooth, HID, MIDI, sensors, autoplay, display capture and XR switched off |
| `Cross-Origin-Opener-Policy` | `same-origin` |

How the policy works:

- Every script and `<style>` element the app renders carries a fresh nonce for that request; there is no `'unsafe-inline'` or `'unsafe-eval'` for scripts. `'wasm-unsafe-eval'` only lets Shiki (code highlighting of Evidence) compile its WebAssembly regex engine.
- `style-src-attr 'unsafe-inline'` stays because server-rendered `style="..."` attributes carry computed layout (sidebar width, split-view and graph positions, table column widths). A style attribute cannot run script.
- In development (`NODE_ENV` not `production`) styles allow `'unsafe-inline'` and `connect-src` allows WebSocket origins, because Vite's dev server injects CSS and talks to the browser at runtime.
- Do not put a proxy in front that rewrites these headers; if it adds its own `Content-Security-Policy`, the browser applies both and the stricter one wins.
- The interactive API reference (`GET /api/v1`) is the one page with a different policy: it is generated by a library that loads the Scalar bundle from `cdn.jsdelivr.net` and injects styles at runtime, so that page alone allows `script-src 'nonce-<per request>' https://cdn.jsdelivr.net` and `style-src 'self' 'unsafe-inline'`. It has `default-src 'none'`, can connect only to itself, and cannot be framed. The JSON spec at `/api/v1/spec.json` and every other route use the page policy.
- A browser that blocks something reports it to `POST /api/csp-report`. The endpoint takes at most 8 KiB per report, logs at most 30 reports a minute per process (a warning with the directive and the blocked and document URLs without query strings, never the raw report), and answers with an empty body. A refused `eval` from the app's own bundle is not logged: the validation library probes for it on every page and falls back when refused.

### Cross-origin access

`/api/v1/*` and `/api/events` send CORS headers only for the origins Better Auth trusts: `BETTER_AUTH_URL` plus `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated, full origins such as `https://app.example.com`). That one list decides both who may sign in from a browser and who may call the API with a user's session from another site; there is no second setting.

- A listed origin gets `Access-Control-Allow-Origin` (its own value), `Access-Control-Allow-Credentials: true`, and, on a preflight, the allowed methods, the requested headers and a 10 minute cache time.
- Any other origin gets no CORS headers, and its preflight gets a bare `204`, so the browser refuses to send the real request or to expose the response.
- Requests without an `Origin` header (the CLI, agents, same-origin page loads) are unaffected.
- Wildcard entries (`https://*.example.com`) and non-web schemes in the list are ignored for CORS, which only takes exact `http(s)` origins. For a local `BETTER_AUTH_URL` (`localhost` or `127.0.0.1`) the list also holds the other spelling on the same port. Outside production it additionally holds the common dev-server fallback ports (3000, 3001, 3002, 3010, 3300); in production it never does.
- The preflight echoes back only well-formed header names from `Access-Control-Request-Headers`.

## How CI checks this

The `Container image` job builds both targets, scans them with Trivy and runs `docker/smoke.sh` against a real Postgres and SeaweedFS: two web replicas migrating an empty database at once, `/api/v1/ready` reaching ok, the sign-in page loading, the worker booting, non-root, and a deliberately failing migration that must stop the container. Details: [`ci-gates`](../contributing/ci-gates.md#container-image). To run the smoke test yourself, start an empty Postgres and a SeaweedFS (`mini -dir=/data`), then `WEB_IMAGE=... WORKER_IMAGE=... SMOKE_DATABASE_URL=... SMOKE_S3_ENDPOINT=... bash docker/smoke.sh` (the header of the script lists every variable; use free ports with `SMOKE_PORT`).
