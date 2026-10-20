#!/usr/bin/env bash
# Smoke test of the built images against a real Postgres and a real S3-compatible store. CI's
# Container job runs it; run it locally the same way (docs/how-to/self-host.md).
#
# It needs, already running and reachable from the host (containers run with --network host):
#   - an EMPTY Postgres database, as its owner        SMOKE_DATABASE_URL
#     (a role that may create roles, tables and schemas; the script creates the application role
#     watchdog_app with docker/postgres/app-role.sql, the way the production compose does, and
#     runs web and worker as it, with the owner URL only for migrations and the admin commands)
#   - an S3-compatible server (SeaweedFS in CI)       SMOKE_S3_ENDPOINT, SMOKE_S3_ACCESS_KEY, SMOKE_S3_SECRET_KEY
# and the images WEB_IMAGE and WORKER_IMAGE. It then checks, in order:
#   1. two web replicas start at once on the empty database: they take the migration advisory
#      lock in turn, both come up, and GET /api/v1/ready reports ok (database and storage);
#   2. GET /api/v1/health answers, the sign-in page renders, and the process is not root;
#   2a. a request is logged once (path without query or cookie) and an asset is served
#      precompressed (br) with Vary and the immutable cache header, plain without Accept-Encoding;
#   3. the worker image boots, skips migrations and keeps running;
#   4. a deliberately failing migration (docker/smoke/failing-migration) stops the web container
#      with a non-zero exit before the app listens, and WD_SKIP_MIGRATIONS=1 lets it start anyway.
#   5. the first-admin command (bootstrap-admin.mjs) creates an admin who signs in while public
#      signup stays closed and refuses a second run; a placeholder secret stops startup naming
#      the variable; a pg_dump of the database restores into an empty one (the backup guide's
#      commands, run in a throwaway postgres client container, SMOKE_PG_CLIENT_IMAGE); the
#      vault-rekey.mjs rotation command refuses a missing old key and a key argument and runs
#      on an empty vault.
#   6. the application role owns nothing and cannot ALTER, DROP or TRUNCATE a table, disable a
#      trigger, create objects or change the audit tables, while ordinary reads work; the web and
#      worker processes do not hold the owner URL.
# Every container is named with the SMOKE_PREFIX and removed on exit.
set -euo pipefail

: "${WEB_IMAGE:?set WEB_IMAGE}"
: "${WORKER_IMAGE:?set WORKER_IMAGE}"
: "${SMOKE_DATABASE_URL:?set SMOKE_DATABASE_URL}"
: "${SMOKE_S3_ENDPOINT:?set SMOKE_S3_ENDPOINT}"
SMOKE_S3_ACCESS_KEY="${SMOKE_S3_ACCESS_KEY:-watchdog}"
SMOKE_S3_SECRET_KEY="${SMOKE_S3_SECRET_KEY:-watchdog-smoke-secret}"
SMOKE_S3_BUCKET="${SMOKE_S3_BUCKET:-watchdog-evidence}"
SMOKE_APP_PASSWORD="${SMOKE_APP_PASSWORD:-smokeapppassword0123}"
SMOKE_PORT="${SMOKE_PORT:-3000}"
SMOKE_PREFIX="${SMOKE_PREFIX:-smoke}"
READY_TIMEOUT_S="${READY_TIMEOUT_S:-120}"

PG_CLIENT_IMAGE="${SMOKE_PG_CLIENT_IMAGE:-postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port_a="$SMOKE_PORT"
port_b="$((SMOKE_PORT + 1))"
containers=()

cleanup() {
  for name in "${containers[@]}"; do docker rm -f "$name" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

fail() {
  echo "::error::smoke: $*" >&2
  for name in "${containers[@]}"; do
    echo "---- logs: $name" >&2
    docker logs "$name" 2>&1 | tail -40 >&2 || true
  done
  exit 1
}

# True when the container's log contains the text. Plain grep reads the whole log: with `pipefail`,
# `docker logs | grep -q` fails whenever grep stops early and docker logs gets SIGPIPE (exit 141).
logs_contain() {
  docker logs "$1" 2>&1 | grep -F -- "$2" >/dev/null
}

# A throwaway client container of the server's major version (pg_dump must not be older than the
# server). Reads stdin, so a SQL file can be piped in.
pg_client() { docker run --rm -i --network host -e POSTGRES_APP_PASSWORD "$PG_CLIENT_IMAGE" "$@"; }

# The two roles, as docker-compose.prod.yml sets them up: SMOKE_DATABASE_URL is the owner, and
# watchdog_app is created by the same SQL file the Postgres container's init runs.
db_base="${SMOKE_DATABASE_URL%/*}"
db_name="${SMOKE_DATABASE_URL##*/}"
app_url="postgresql://watchdog_app:${SMOKE_APP_PASSWORD}@${SMOKE_DATABASE_URL#*@}"
POSTGRES_APP_PASSWORD="$SMOKE_APP_PASSWORD" pg_client psql "$SMOKE_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f - \
  <"$here/postgres/app-role.sql" || fail "could not create the application role"

# Placeholder secrets that only live for this run. Same shape a real install sets: the app role in
# DATABASE_URL, the owner in DATABASE_URL_MIGRATE (migrations and the admin commands only).
app_env=(
  -e "DATABASE_URL=$app_url"
  -e "DATABASE_URL_MIGRATE=$SMOKE_DATABASE_URL"
  -e "POSTGRES_PASSWORD=smoke-owner-password-in-env-file"
  -e "S3_ENDPOINT=$SMOKE_S3_ENDPOINT"
  -e "S3_ACCESS_KEY=$SMOKE_S3_ACCESS_KEY"
  -e "S3_SECRET_KEY=$SMOKE_S3_SECRET_KEY"
  -e "S3_BUCKET=$SMOKE_S3_BUCKET"
  -e "BETTER_AUTH_SECRET=smoke-secret-not-for-production-0123456789"
  -e "WD_MASTER_VAULT_KEY=smoke-vault-key-not-for-production-0123456789"
)

start_web() { # name port [extra docker args...]
  local name="$1" port="$2"
  shift 2
  containers+=("$name")
  docker run -d --name "$name" --network host \
    "${app_env[@]}" -e "PORT=$port" -e "BETTER_AUTH_URL=http://127.0.0.1:$port" \
    "$@" "$WEB_IMAGE" >/dev/null
}

wait_ready() { # port
  local port="$1" deadline=$((SECONDS + READY_TIMEOUT_S))
  until curl -fsS "http://127.0.0.1:$port/api/v1/ready" >/dev/null 2>&1; do
    ((SECONDS < deadline)) || fail "port $port never reported ready in ${READY_TIMEOUT_S}s"
    sleep 2
  done
}

# The bucket is the one thing readiness needs that the image does not create.
S3_ENDPOINT="$SMOKE_S3_ENDPOINT" S3_ACCESS_KEY="$SMOKE_S3_ACCESS_KEY" \
  S3_SECRET_KEY="$SMOKE_S3_SECRET_KEY" S3_BUCKET="$SMOKE_S3_BUCKET" \
  bash "$here/../scripts/s3-init.sh"

echo "== 1. two replicas race to migrate an empty database"
start_web "$SMOKE_PREFIX-web-a" "$port_a"
start_web "$SMOKE_PREFIX-web-b" "$port_b"
wait_ready "$port_a"
wait_ready "$port_b"
ready="$(curl -fsS "http://127.0.0.1:$port_a/api/v1/ready")"
echo "ready: $ready"
[[ "$ready" == *'"database":"ok"'* && "$ready" == *'"storage":"ok"'* ]] || fail "readiness body: $ready"
for name in "$SMOKE_PREFIX-web-a" "$SMOKE_PREFIX-web-b"; do
  logs_contain "$name" "migrate: done" || fail "$name did not report migrate: done"
done

echo "== 2. liveness, sign-in page, non-root"
curl -fsS "http://127.0.0.1:$port_a/api/v1/health" | grep -F '"ok":true' >/dev/null || fail "health"
signin="$(curl -fsS "http://127.0.0.1:$port_a/auth/sign-in" | tr -d '\0')"
[[ "$signin" == *"<html"* ]] || fail "sign-in page is not HTML"
[[ "$signin" == *"Sign in"* || "$signin" == *"sign-in"* ]] || fail "sign-in page has no sign-in content"
uid="$(docker exec "$SMOKE_PREFIX-web-a" id -u)"
[[ "$uid" != "0" ]] || fail "web container runs as root"
echo "uid=$uid"

echo "== 2a. each request is logged once without its query or cookie; assets are served precompressed"
curl -fsS -o /dev/null -H "Cookie: smoke_probe=smoke-cookie-secret" -H "x-request-id: smoke-req-1" \
  "http://127.0.0.1:$port_a/auth/sign-in?smoke_probe=smoke-query-secret"
deadline=$((SECONDS + 15))
until logs_contain "$SMOKE_PREFIX-web-a" '"scope":"http.request"'; do
  ((SECONDS < deadline)) || fail "no http.request event in the web log"
  sleep 1
done
# The request id marks this request: the plain sign-in fetch above logged the same path too.
request_line="$(docker logs "$SMOKE_PREFIX-web-a" 2>&1 | grep -F '"scope":"http.request"' | grep -F '"requestId":"smoke-req-1"' | head -1)"
echo "request event: $request_line"
for field in '"method":"GET"' '"path":"/auth/sign-in"' '"status":200' '"durationMs":' '"requestId":"smoke-req-1"'; do
  [[ "$request_line" == *"$field"* ]] || fail "request event lacks $field: $request_line"
done
[[ "$(docker logs "$SMOKE_PREFIX-web-a" 2>&1 | grep -cF '"requestId":"smoke-req-1"')" == "1" ]] || fail "the sign-in request was logged more than once"
for secret in smoke-query-secret smoke-cookie-secret; do
  if logs_contain "$SMOKE_PREFIX-web-a" "$secret"; then fail "the web log holds $secret"; fi
done
asset="$(printf '%s' "$signin" | grep -o '/assets/[^"]*\.js' | head -1)"
[[ -n "$asset" ]] || fail "the sign-in page references no /assets script"
asset_url="http://127.0.0.1:$port_a$asset"
br_headers="$(curl -fsS -D - -o /dev/null -H 'Accept-Encoding: br' "$asset_url")"
grep -iF 'content-encoding: br' <<<"$br_headers" >/dev/null || fail "$asset is not served brotli-encoded: $br_headers"
grep -iF 'vary: accept-encoding' <<<"$br_headers" >/dev/null || fail "$asset lacks Vary: Accept-Encoding"
grep -iF 'cache-control: public, max-age=31536000, immutable' <<<"$br_headers" >/dev/null || fail "$asset lost its immutable cache header"
plain_headers="$(curl -fsS -D - -o /dev/null -H 'Accept-Encoding: identity' "$asset_url")"
if grep -iF 'content-encoding:' <<<"$plain_headers" >/dev/null; then fail "$asset is encoded for a client that accepts none"; fi
echo "$asset: br with Vary and immutable cache; plain without Accept-Encoding"

echo "== 2b. the first-admin command creates an admin who can sign in, with signup closed"
admin_email="smoke-admin@example.test"
admin_out="$(docker run --rm --network host "${app_env[@]}" "$WEB_IMAGE" \
  node bootstrap-admin.mjs --email "$admin_email" --name "Smoke Admin" --print-password)" || fail "bootstrap-admin failed: $admin_out"
admin_password="$(printf '%s\n' "$admin_out" | sed -n 's/^Password (shown once, store it now): //p')"
[[ -n "$admin_password" ]] || fail "bootstrap-admin printed no password: $admin_out"
sign_in() { # email password -> HTTP status
  curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$port_a/api/auth/sign-in/email" \
    -H 'Content-Type: application/json' -H "Origin: http://127.0.0.1:$port_a" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
[[ "$(sign_in "$admin_email" "$admin_password")" == "200" ]] || fail "the generated admin cannot sign in"
[[ "$(sign_in "$admin_email" "not-the-password-0")" != "200" ]] || fail "a wrong password signed in"
signup_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$port_a/api/auth/sign-up/email" \
  -H 'Content-Type: application/json' -H "Origin: http://127.0.0.1:$port_a" \
  -d '{"email":"intruder@example.test","password":"intruder-password-1","name":"Intruder"}')"
[[ "$signup_code" != "200" ]] || fail "public signup is open"
set +e
second_out="$(docker run --rm --network host "${app_env[@]}" "$WEB_IMAGE" \
  node bootstrap-admin.mjs --email "second-admin@example.test" --print-password 2>&1)"
second_code=$?
set -e
((second_code != 0)) || fail "bootstrap-admin created a second admin"
[[ "$second_out" == *"already exists"* ]] || fail "bootstrap-admin refusal: $second_out"
echo "admin created, signed in, signup closed, second run refused (exit $second_code)"

echo "== 2c. a placeholder secret stops startup and names the variable"
# The web server answers 500 and its healthcheck fails; the log names the variable. The same
# environment makes the first-admin command refuse (exit non-zero) before it touches the database.
placeholder="change-me-to-a-long-random-string-at-least-32"
set +e
bad_out="$(docker run --rm --network host "${app_env[@]}" -e "BETTER_AUTH_SECRET=$placeholder" -e "WD_SKIP_MIGRATIONS=1" \
  "$WEB_IMAGE" node bootstrap-admin.mjs --email "placeholder@example.test" --print-password 2>&1)"
bad_code=$?
set -e
((bad_code != 0)) || fail "a placeholder BETTER_AUTH_SECRET was accepted"
[[ "$bad_out" == *"BETTER_AUTH_SECRET is a placeholder"* ]] || fail "placeholder message: $bad_out"
start_web "$SMOKE_PREFIX-web-placeholder" "$((SMOKE_PORT + 4))" -e "BETTER_AUTH_SECRET=$placeholder" -e "WD_SKIP_MIGRATIONS=1"
deadline=$((SECONDS + 30))
until logs_contain "$SMOKE_PREFIX-web-placeholder" "BETTER_AUTH_SECRET is a placeholder"; do
  ((SECONDS < deadline)) || fail "the web container never named the placeholder secret"
  sleep 1
done
[[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$((SMOKE_PORT + 4))/api/v1/health")" != "200" ]] \
  || fail "a web container with a placeholder secret reports healthy"

echo "== 2d. the vault rotation command is in the image and refuses what it should"
# REKEY_ENV: extra docker run arguments, word-split on purpose (-e NAME=value).
rekey() {
  # shellcheck disable=SC2086
  docker run --rm --network host "${app_env[@]}" -e "WD_SKIP_MIGRATIONS=1" ${REKEY_ENV:-} "$WEB_IMAGE" node vault-rekey.mjs "$@"
}
set +e
no_old_out="$(rekey 2>&1)"
no_old_code=$?
arg_out="$(rekey --old-key=hunter2 2>&1)"
arg_code=$?
set -e
((no_old_code == 2)) || fail "vault-rekey without an old key exited $no_old_code: $no_old_out"
((arg_code == 2)) || fail "vault-rekey accepted a key argument (exit $arg_code)"
[[ "$arg_out" != *hunter2* ]] || fail "vault-rekey echoed a key argument"
empty_out="$(REKEY_ENV="-e WD_MASTER_VAULT_KEY_OLD=change-me-placeholder" rekey 2>&1)" || fail "vault-rekey on an empty vault failed: $empty_out"
[[ "$empty_out" == *"no credentials"* ]] || fail "vault-rekey empty-vault message: $empty_out"

echo "== 3. worker boots and skips migrations"
containers+=("$SMOKE_PREFIX-worker")
docker run -d --name "$SMOKE_PREFIX-worker" --network host "${app_env[@]}" -e "DATABASE_URL_MIGRATE=" "$WORKER_IMAGE" >/dev/null
sleep 10
[[ "$(docker inspect -f '{{.State.Running}}' "$SMOKE_PREFIX-worker")" == "true" ]] || fail "worker stopped"
logs_contain "$SMOKE_PREFIX-worker" "skipping migrations" || fail "worker did not skip migrations"
[[ "$(docker exec "$SMOKE_PREFIX-worker" id -u)" != "0" ]] || fail "worker container runs as root"
# The log drain must have somewhere to write as a non-root user (WD_LOG_DIR): evlog prints this
# on every event when it does not.
for name in "$SMOKE_PREFIX-web-a" "$SMOKE_PREFIX-worker"; do
  if logs_contain "$name" "Failed to send events"; then
    fail "$name cannot write its log drain"
  fi
done

echo "== 4. a failing migration stops the container"
containers+=("$SMOKE_PREFIX-web-bad")
set +e
docker run --name "$SMOKE_PREFIX-web-bad" --network host \
  "${app_env[@]}" -e "PORT=$((SMOKE_PORT + 2))" \
  -v "$here/smoke/failing-migration:/migrations:ro" -e "WD_MIGRATIONS_DIR=/migrations" \
  "$WEB_IMAGE" >"$SMOKE_PREFIX-bad.log" 2>&1
code=$?
set -e
cat "$SMOKE_PREFIX-bad.log"
rm -f "$SMOKE_PREFIX-bad.log"
((code != 0)) || fail "the web container exited 0 with a failing migration"
if curl -fsS "http://127.0.0.1:$((SMOKE_PORT + 2))/api/v1/health" >/dev/null 2>&1; then
  fail "the app listens although its migration failed"
fi
echo "exit code with a failing migration: $code"

echo "== 4b. the kill switch skips the same failing migration"
start_web "$SMOKE_PREFIX-web-skip" "$((SMOKE_PORT + 3))" \
  -v "$here/smoke/failing-migration:/migrations:ro" -e "WD_MIGRATIONS_DIR=/migrations" -e "WD_SKIP_MIGRATIONS=1"
wait_ready "$((SMOKE_PORT + 3))"

echo "== 5. backup and restore of Postgres, the commands docs/how-to/backup-restore.md gives"
# Same flags as the guide, run as the owner: custom format dump, pg_restore into an empty database.
restore_db="$(printf '%s' "$SMOKE_PREFIX" | tr -c 'a-zA-Z0-9' '_')_restore"
dump_file="$(mktemp)"
restore_cleanup() {
  rm -f "$dump_file"
  pg_client psql "$db_base/postgres" -qc "DROP DATABASE IF EXISTS $restore_db" >/dev/null 2>&1 || true
}
trap 'restore_cleanup; cleanup' EXIT
pg_client pg_dump --format=custom --no-owner "$SMOKE_DATABASE_URL" >"$dump_file" || fail "pg_dump failed"
[[ -s "$dump_file" ]] || fail "pg_dump wrote nothing"
pg_client psql "$db_base/postgres" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $restore_db" -c "CREATE DATABASE $restore_db" \
  || fail "could not create the restore database"
pg_client pg_restore --no-owner --exit-on-error --dbname "$db_base/$restore_db" <"$dump_file" || fail "pg_restore failed"
count() { pg_client psql "$db_base/$1" -At -c "$2"; }
[[ "$(count "$restore_db" "select email from auth.\"user\" where role = 'admin'")" == "$admin_email" ]] \
  || fail "the restored database lacks the admin account"
original_migrations="$(count "$db_name" "select count(*) from drizzle.__drizzle_migrations")"
[[ "$(count "$restore_db" "select count(*) from drizzle.__drizzle_migrations")" == "$original_migrations" ]] \
  || fail "the restored migration journal differs"
echo "dump $(wc -c <"$dump_file") bytes restored into $restore_db: admin and $original_migrations migrations present"

echo "== 6. the application role has data privileges only"
# Run as watchdog_app, the role the web and worker containers connect as. A statement that must
# fail is run for its error text: Postgres says "permission denied" or "must be owner".
app_sql() { pg_client psql "$app_url" -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
must_deny() {
  local out code
  set +e
  out="$(app_sql "$1")"
  code=$?
  set -e
  ((code != 0)) || fail "the application role was allowed: $1"
  [[ "$out" == *"permission denied"* || "$out" == *"must be owner"* ]] || fail "unexpected error for '$1': $out"
}
[[ "$(app_sql "select count(*) from public.cases")" == "0" ]] || fail "the application role cannot read the cases table"
[[ "$(app_sql "select rolsuper::text || rolcreatedb::text || rolcreaterole::text from pg_roles where rolname = current_user")" == "falsefalsefalse" ]] \
  || fail "the application role has elevated attributes"
[[ "$(app_sql "select count(*) from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = current_user")" == "0" ]] \
  || fail "the application role owns database objects"
must_deny "alter table public.cases add column smoke_probe int"
must_deny "drop table public.cases"
must_deny "truncate public.cases"
must_deny "truncate public.graph_writes"
must_deny "alter table public.cases disable trigger all"
must_deny "alter table public.graph_writes disable trigger all"
must_deny "alter table pgboss.job add column smoke_probe int"
must_deny "create table public.smoke_probe (id int)"
must_deny "create schema smoke_probe"
must_deny "update public.graph_writes set summary = 'x'"
must_deny "delete from public.graph_writes"
must_deny "update public.case_deletion_records set event = 'restored'"
must_deny "delete from public.case_deletion_records"
# PID 1 is the server (the entrypoint exec'd it): its environment must not carry the owner URL.
for name in "$SMOKE_PREFIX-web-a" "$SMOKE_PREFIX-worker"; do
  if docker exec "$name" cat /proc/1/environ | tr '\0' '\n' | grep -E '^(DATABASE_URL_MIGRATE|POSTGRES_PASSWORD)=.' >/dev/null; then
    fail "$name holds the owner database URL"
  fi
done
echo "application role: reads work; DDL, TRUNCATE, trigger changes and audit-table edits are denied"

echo "smoke: ok"
