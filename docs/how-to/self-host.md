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

The file holds no secrets. A missing `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` or `BETTER_AUTH_URL` stops `up` with a message; `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY` are blank in the example and the app refuses to start without them (a web container with a bad environment stays up answering 500, and its healthcheck reports it unhealthy). Generate secrets with the `openssl` commands in `env.production.example`. Keep `WD_MASTER_VAULT_KEY` safe: without it stored Cap credentials cannot be read.

Start order, enforced by `depends_on`: Postgres and storage healthy, then `s3-init` (creates the Evidence bucket; readiness needs it), then `web` (migrates, then serves; healthy means liveness answers, which happens only after the migrations finished), then `worker`.

Check it:

```bash
curl -fsS http://127.0.0.1:3000/api/v1/health   # liveness: {"ok":true,"service":"watchdog"}
curl -fsS http://127.0.0.1:3000/api/v1/ready    # readiness: {"ok":true,"database":"ok","storage":"ok"}
```

`/health` answers without touching Postgres or storage (the compose healthcheck uses it). `/ready` answers 200 only when both dependencies do, otherwise 503 with the reason (`timeout` or `unreachable`): use it for a load balancer.

The web port binds to `127.0.0.1` by default. Put a TLS reverse proxy in front before exposing it, and set `BETTER_AUTH_URL` to the URL users type. Evidence uploads go from the browser straight to object storage with presigned requests, so a public install also sets `S3_PUBLIC_URL` to the store's public HTTPS address (`S3_ENDPOINT` stays the internal one): see [`reverse-proxy`](reverse-proxy.md), which also covers the bucket's CORS rule.

## Database roles

The stack uses two Postgres roles, so that the running app cannot change the structure of its own database or the integrity rules built into it.

| Role | Used by | Can |
| --- | --- | --- |
| Owner: `POSTGRES_USER` (default `watchdog`) with `POSTGRES_PASSWORD` | Migrations, the [first-admin command](#first-admin) and [vault key rotation](backup-restore.md#rotating-the-vault-key); `pg_dump` and restore | Everything: it owns every table and schema |
| Application: `watchdog_app` with `POSTGRES_APP_PASSWORD` | The `web` server and the `worker` | `SELECT`, `INSERT`, `UPDATE` and `DELETE` on the application tables (the `public` and `auth` schemas and pg-boss's `pgboss` schema) and `USAGE` and `SELECT` on their sequences |

`watchdog_app` is not a superuser, owns nothing and may not create objects in any schema or database. It cannot `ALTER`, `DROP` or `TRUNCATE` a table, add or disable a trigger, or edit the migration journal. On the append-only audit tables (`graph_writes` and `case_deletion_records`, and `graph_history` as read-only) it may read and add rows but not update or delete them. The database, not the application code, enforces this: a bug or a compromised web process cannot undo it.

How it is wired:

- **Creation.** The Postgres container creates `watchdog_app` from `docker/postgres/app-role.sql`, with the password from `POSTGRES_APP_PASSWORD`, the first time its data volume is made. Generate the password like the owner's: `openssl rand -hex 24` (letters and digits only, it goes into a connection URL), and keep it different from `POSTGRES_PASSWORD`.
- **Two connection strings.** `docker-compose.prod.yml` builds `DATABASE_URL` (the application role) for `web` and `worker`, and `DATABASE_URL_MIGRATE` (the owner) for `web` only. Do not set either in `.env.production`: the compose file's value wins.
- **The owner's password stays out of the server process.** `.env.production` is shared with the containers, so the compose file blanks `POSTGRES_PASSWORD` for `web` and `worker`. The `web` entrypoint uses the owner URL to migrate, then removes `DATABASE_URL_MIGRATE` and `POSTGRES_PASSWORD` before it starts the server, so the running app holds only the application role's password. The `worker` is never given the owner URL. The smoke test checks the environment of both servers.
- **Grants follow the schema.** After every migration run the migrator regrants `watchdog_app` on all tables and sequences, sets default privileges so a table a later migration creates is usable at once, and re-applies the audit-table restrictions. It also installs and upgrades pg-boss's schema as the owner (the app starts pg-boss without installing anything). This happens on every start of `web`, including when no migration is pending. With `WD_SKIP_MIGRATIONS=1` it does not run, so run the migrator by hand after an upgrade ([`upgrade`](upgrade.md#migrating-by-hand)).

An install made before the roles were split converts in a few steps: [`upgrade`](upgrade.md#converting-an-existing-install-to-two-database-roles).

## Deleted Cases and retention

Deleting a Case in the app moves it to Deleted Cases (the Cases page, Deleted Cases, for owners and admins) and cancels its queued and running Jobs. It is not erased: an owner or admin can restore it for `WD_CASE_RETENTION_DAYS` days (default 30, set it in `.env.production` for `web` and `worker`; [`configuration`](../reference/platform/configuration.md)). The date is fixed when the Case is deleted: changing the setting later affects only Cases deleted after it. Then the worker purges it. The Case's link is free for a new Case as soon as it is deleted; if a restore finds it taken, the Case comes back under a new link and says so. The worker checks at start and every hour, so a Case goes within an hour of the window ending.

What a purge removes: the Case, its Entities, Edges, Claims, Identifiers, Events, Questions, Tasks, Evidence rows, Proposals, Jobs, the Graph history, the activity entries and cached Cap results, **and every file the Case has in the bucket** (Evidence files and Cap artifacts, everything under `{caseId}/`). What stays: a short, permanent deletion record per delete, restore and purge (`case_deletion_records`: the Case's name and slug, who did it and when, and the counts of what was erased; no content). The application role cannot change or delete that record, and the database refuses to delete a Case, or change its deletion state, unless the matching record is written in the same transaction. Repairs by hand are done as the owner login (`DATABASE_URL_MIGRATE`), which the guard does not stop and which leaves no record.

If the bucket cannot be reached the Case is not half-erased and forgotten: it stays in Deleted Cases with a note that the last purge failed, the worker retries it every hour, and an owner or admin can press Purge now to try again. Restoring is refused once a purge has begun. An owner or admin can also purge at once (Purge now, typed confirmation, signed in; an API key cannot) without waiting for the window.

**Backups still hold deleted Cases** until they age out ([`backup-restore`](backup-restore.md#deleted-cases-and-backups)). Deleting an organization purges all its Cases at once.

## Breach Caps are off by default

The breach Caps (Have I Been Pwned, Hudson Rock, DeHashed, Snusbase) query breach and leak corpora about people, and DeHashed and Snusbase can return recovered plaintext credentials. They are **off** until you set `WD_ENABLE_BREACH_CAPS=1` in `.env.production` (for `web` and `worker`; [`configuration`](../reference/platform/configuration.md)) and restart both. While it is off, none of them can be queued or run, a queued one ends failed with a message naming the setting, the Playbooks `email-breach` and `email-corpus` cannot start, and the web app shows them disabled.

Turning it on is a decision for you, the operator: you are responsible for a lawful basis for looking people up in these corpora, and for each provider's terms, which the [`cap-register`](../reference/platform/cap-register.md) links per Cap. What the setting gates, and where it is enforced: [`caps-lexicon`](../reference/platform/caps-lexicon.md#breach-caps-are-opt-in). Each user still stores their own provider keys in Settings.

## Secrets are checked at start

The app refuses to start with a placeholder or weak secret and names the variable in its log (a web container answers 500 and reports unhealthy). `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY` need at least 32 characters and may not be a known placeholder (`change-me...`, `secret`, `password`); `S3_SECRET_KEY` may not be a placeholder or the development default. Generate each with `openssl rand -base64 32`. The rules are listed in the [configuration reference](../reference/platform/configuration.md#how-to-read-it).

## Migrations on start

The entrypoint (`docker/entrypoint.sh`) runs `migrate.mjs` before the app starts. It applies the same migrations as `pnpm db:migrate` (same `drizzle` folder and bookkeeping table) without drizzle-kit, under a Postgres advisory lock, so two replicas starting together take turns: the second waits, then finds nothing to apply. A failing migration rolls back, prints `migrate: failed: ...` and exits non-zero **before the app listens**; with `restart: unless-stopped` the container retries until you fix it.

| Variable | Effect |
| --- | --- |
| `WD_SKIP_MIGRATIONS` | `1`, `true`, `yes` or `on` skips migrations; `0`, `false`, `no`, `off` or empty runs them; anything else exits 64. The `web` target runs them; the `worker` target defaults to skipping (its image sets `1`). |
| `DATABASE_URL_MIGRATE` | Connection URL of the owner role: migrations, pg-boss's schema and the application role's grants. Falls back to `DATABASE_URL`, which then has to own the schema. The compose file sets it for `web` from `POSTGRES_USER` and `POSTGRES_PASSWORD`; see [Database roles](#database-roles). |
| `WD_MIGRATIONS_DIR` | Folder of migrations. The image sets `/app/drizzle`; only tests change it. |

To migrate by hand instead, set `WD_SKIP_MIGRATIONS=1` on `web` and run the migrator once: `docker compose ... run --rm --no-deps -e WD_SKIP_MIGRATIONS=0 web true` applies pending migrations, regrants the application role and exits.

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

Queue warnings from the job queue (a handler that overran its expiry, a backlog, slow queries) are logged at `warn` level with scope `pg-boss:worker` or `pg-boss:producer`, and also kept in the `pgboss.warning` table (pruned by pg-boss after its retention window). A Job that overruns its expiry is interrupted by the worker and fails with `Timed out after ...`. Logs go to stdout (read them with `docker compose logs`); the NDJSON log drain writes under `/tmp/evlog` inside each container (`WD_LOG_DIR`), which the stack mounts as a tmpfs. The Case Export shadow lives in the `export_data` volume at `/data/export` (`WD_EXPORT_DIR`); web and worker both mount it, because the worker writes the exports and the web process renames or removes a Case's directory. The root filesystem of both app containers is read-only.

The web container logs every request once, as one JSON event per line in the same format as the rest of the app. A page or file request is logged by the container server itself, with `method`, `path` (the path only: never the query string), `status`, `durationMs` and the `x-request-id` header when the client sent a plain one (letters, digits and `._:-`, at most 128 characters):

```json
{
  "scope": "http.request",
  "method": "GET",
  "path": "/auth/sign-in",
  "status": 200,
  "durationMs": 10.91,
  "requestId": "req-7f3a",
  "duration": "11ms",
  "timestamp": "2026-10-20T16:06:53.414Z",
  "level": "info",
  "service": "watchdog-web",
  "environment": "production"
}
```

Cookies, authorization and other headers, query strings and request or response bodies are never logged. API requests (`/api/**`) and server functions keep the richer event the app already wrote for them (route, user, database time), so they appear once, not twice. Static files under `/assets/` and the health and readiness probes are logged at `debug` level, which the logger drops: a busy site does not fill its log with asset hits and healthcheck polls. Failures stay visible: a `4xx` is a `warn` and a `5xx` an `error`, whatever the path.

The client build ships brotli and gzip copies of its scripts, styles and other text files (`.br`, `.gz`). The web server sends the one the browser accepts, with `Content-Encoding` and `Vary: Accept-Encoding`, and the plain file to a client that accepts neither. Files under `/assets/` carry `Cache-Control: public, max-age=31536000, immutable`; nothing else is cached by the server. If a reverse proxy in front compresses responses itself, let it pass an already encoded response through unchanged.

## Error reporting

Off by default: a fresh install sends nothing to any third party. To get errors from the web app, the worker and the browser into a tracker you run or rent, set one variable in `.env.production` and restart `web` and `worker`:

```bash
# Sentry, GlitchTip, Bugsink or any server that speaks the Sentry protocol
WD_ERROR_REPORTING_DSN=https://<key>@errors.example.com/<project>
# optional: a version or commit SHA shown on each report
WD_RELEASE=1.4.0
```

What is reported: every error-level log event (an unhandled request error, a server function failure, a failed Cap Job) and every uncaught exception or unhandled promise rejection in the server or worker, each with the route or procedure, the request id, the Job id and the release. The browser reports unhandled errors and rejections and render crashes to the web app itself (`/api/client-errors`), never to the tracker directly, so the DSN stays on the server and the browser needs no extra network access.

What never leaves: the report is scrubbed on top of the log redaction. Passwords, tokens, cookies, API keys, vault keys, request and response bodies, Evidence content and email addresses are dropped by name; every value in the validated environment marked sensitive (see the [configuration reference](../reference/platform/configuration.md)) is removed wherever it appears; bearer tokens, URL credentials and query strings, JWTs and long opaque strings are removed from messages and stack traces. Reporting is rate limited (30 reports a minute per process), runs after the response, and a tracker that is down or slow never fails or delays a request. A DSN that does not parse leaves reporting off.

The web app also recovers from a deploy that replaced the code an open tab still uses: on a failed dynamic import it reloads the page once (a session flag stops a second reload within a minute), and any other crash shows a recovery screen with Try again and Go to dashboard instead of a blank page.

## Log export (OTLP)

Off by default: a fresh install sends no logs anywhere. The web app and the worker always write NDJSON files and stdout; to also ship every log event to an observability backend, set `WD_OTLP_ENDPOINT` in `.env.production` and restart `web` and `worker`. It speaks OTLP over HTTP (JSON), the protocol Datadog, Grafana, Honeycomb, SigNoz and the OpenTelemetry Collector all accept. Watchdog appends `/v1/logs` to the endpoint.

| Setting | Meaning |
| --- | --- |
| `WD_OTLP_ENDPOINT` | Base URL of the receiver, `http://` or `https://`. Treat it as a secret: some services put a token in it |
| `WD_OTLP_HEADERS` | Request headers as `name=value` pairs separated by commas, usually the API key. A value may contain `=` (base64) and spaces but not a comma |
| `WD_OTLP_RESOURCE_ATTRIBUTES` | Optional extra resource attributes, `key=value` pairs separated by commas |
| `WD_RELEASE` | Optional build label, sent as `service.version` (also used by [error reporting](#error-reporting)) |

A value that does not parse (an endpoint that is not an http(s) URL, a header without `=`, a header name with a space) leaves export off, logs one warning naming the setting at start, and never stops the app from starting.

What each record carries, so backends can filter and correlate:

| Field in the backend | Source |
| --- | --- |
| `service.name` (resource) | `watchdog-web` or `watchdog-worker` |
| `service.version` (resource) | `WD_RELEASE` |
| `deployment.environment` (resource) | `NODE_ENV` |
| severity (`severityText`, `severityNumber`) | the log level: debug, info, warn, error |
| `requestId` | the request id of an API route or server function |
| `job.jobId`, `cap.capabilityId` | the Job and Cap of a worker event |
| `traceId`, `spanId` | the W3C trace context, when an event has well-formed ones |
| `http.request.method`, `url.path`, `http.response.status_code`, `exception.*` | OpenTelemetry semantic-convention copies of the request and error fields |
| the other event fields | dotted attributes (`db.queries`, `durationMs`, `auth.denied`) |

What never leaves: every event is scrubbed by the same code as [error reports](#error-reporting), after the log redaction. Passwords, tokens, cookies, API keys, vault keys, request and response bodies, Evidence content and email addresses are dropped by name; every value in the validated environment marked sensitive (including the OTLP endpoint and headers) is removed wherever it appears; bearer tokens, URL credentials and query strings, JWTs and long opaque strings are removed from messages. Size bounds apply.

Export never slows or fails a request. Events are queued after the response, sent in batches of up to 50 at least every 5 seconds, from a queue of at most 500 (the oldest events are dropped first), with a 3 second timeout and one retry. The worker delivers what is still queued when it stops (waiting at most 2 seconds); the web app does not, so a few seconds of its latest events can be lost at a restart. A receiver that is down, errors or hangs costs only the dropped events: the file drain and the request are unaffected.

Examples for `.env.production`. Each key is a placeholder.

```bash
# OpenTelemetry Collector (or any OTLP/HTTP receiver on its default port 4318)
WD_OTLP_ENDPOINT=http://otel-collector:4318

# Datadog, through the Datadog Agent with its OTLP receiver and log collection enabled
# (agent: DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=0.0.0.0:4318, DD_OTLP_CONFIG_LOGS_ENABLED=true)
WD_OTLP_ENDPOINT=http://datadog-agent:4318

# Grafana Cloud (Loki): the OTLP gateway of your stack; the token is base64 of <instance id>:<API token>
WD_OTLP_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp
WD_OTLP_HEADERS=Authorization=Basic <base64 of instance-id:api-token>

# Honeycomb (EU: https://api.eu1.honeycomb.io); logs need a dataset name
WD_OTLP_ENDPOINT=https://api.honeycomb.io
WD_OTLP_HEADERS=x-honeycomb-team=<ingest key>,x-honeycomb-dataset=watchdog

# SigNoz Cloud (self-hosted: http://<signoz-otel-collector>:4318 and no header)
WD_OTLP_ENDPOINT=https://ingest.<region>.signoz.cloud:443
WD_OTLP_HEADERS=signoz-ingestion-key=<ingestion key>
```

A Collector that forwards to Loki, for a self-hosted Grafana stack:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  otlphttp/loki:
    endpoint: http://loki:3100/otlp
service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [otlphttp/loki]
```

Datadog also accepts OTLP logs straight at an intake for your site, with the `dd-api-key` header; check Datadog's OTLP documentation for the current URL, and prefer the Agent when you already run one. Check a new setup by loading any page and looking for records with `service.name` `watchdog-web` in the backend within about ten seconds.

## Security headers and cross-origin access

The web app sends the same browser security headers on every response (pages, `/api/*`, the live-update stream). They need no configuration; two settings decide what they name:

| Setting | Used for |
| --- | --- |
| `S3_PUBLIC_URL`, else `S3_ENDPOINT` | The object store's origin is the only extra origin the page may connect to (presigned uploads) and load images from (Evidence previews). It is the origin of `S3_PUBLIC_URL` when that is set (the address browsers use, see [`reverse-proxy`](reverse-proxy.md)), otherwise of `S3_ENDPOINT`. |
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

## Request size limit

The web app reads at most 2 MiB (`REQUEST_BODY_MAX_BYTES`, `@watchdog/schemas`) of any request body: a body over the limit gets `413` before routing, so it never reaches the API, Better Auth or a server function. The answer is JSON, `{ "defined": false, "code": "PAYLOAD_TOO_LARGE", "status": 413, "message": ..., "data": { "code": "payload_too_large", "maxBytes": 2097152 } }`, and carries the security headers (and CORS headers on `/api/v1`). A declared `Content-Length` over the limit is refused without reading the body; a body with no declared length is read up to the limit and refused beyond it. The container server (`scripts/serve.mjs`, srvx `maxRequestBodySize`) enforces the same number as a second line of defence. Evidence files are not affected: the browser and the CLI send them straight to the object store with a presigned `PUT`, bounded by `MAX_UPLOAD_BYTES` (100 MiB). If a reverse proxy in front has its own, smaller body limit (nginx `client_max_body_size` defaults to 1 MiB), raise it to at least 2 MiB so large pastes reach the app.

## How CI checks this

The `docker` job builds both targets, scans them with Trivy and runs `docker/smoke.sh` against a real Postgres and SeaweedFS (the script creates `watchdog_app` and runs web and worker as it): two web replicas migrating an empty database at once, `/api/v1/ready` reaching ok, the sign-in page loading, the first-admin command creating an admin who signs in while signup stays closed (and refusing a second run), a placeholder secret stopping startup, the worker booting, non-root, a deliberately failing migration that must stop the container, and a `pg_dump` restored into an empty database (the [backup guide](backup-restore.md)'s commands). Details: [`ci-gates`](../contributing/ci-gates.md#docker-images). To run the smoke test yourself, start an empty Postgres and a SeaweedFS (`mini -dir=/data`), then `WEB_IMAGE=... WORKER_IMAGE=... SMOKE_DATABASE_URL=... SMOKE_S3_ENDPOINT=... bash docker/smoke.sh` (the header of the script lists every variable; use free ports with `SMOKE_PORT`).
