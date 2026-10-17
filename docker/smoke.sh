#!/usr/bin/env bash
# Smoke test of the built images against a real Postgres and a real S3-compatible store. CI's
# Container job runs it; run it locally the same way (docs/how-to/self-host.md).
#
# It needs, already running and reachable from the host (containers run with --network host):
#   - an EMPTY Postgres database                      SMOKE_DATABASE_URL
#   - an S3-compatible server (SeaweedFS in CI)       SMOKE_S3_ENDPOINT, SMOKE_S3_ACCESS_KEY, SMOKE_S3_SECRET_KEY
# and the images WEB_IMAGE and WORKER_IMAGE. It then checks, in order:
#   1. two web replicas start at once on the empty database: they take the migration advisory
#      lock in turn, both come up, and GET /api/v1/ready reports ok (database and storage);
#   2. GET /api/v1/health answers, the sign-in page renders, and the process is not root;
#   3. the worker image boots, skips migrations and keeps running;
#   4. a deliberately failing migration (docker/smoke/failing-migration) stops the web container
#      with a non-zero exit before the app listens, and WD_SKIP_MIGRATIONS=1 lets it start anyway.
#   5. the first-admin command (bootstrap-admin.mjs) creates an admin who signs in while public
#      signup stays closed and refuses a second run; a placeholder secret stops startup naming
#      the variable; a pg_dump of the database restores into an empty one (the backup guide's
#      commands, run in a throwaway postgres client container, SMOKE_PG_CLIENT_IMAGE); the
#      vault-rekey.mjs rotation command refuses a missing old key and a key argument and runs
#      on an empty vault.
# Every container is named with the SMOKE_PREFIX and removed on exit.
set -euo pipefail

: "${WEB_IMAGE:?set WEB_IMAGE}"
: "${WORKER_IMAGE:?set WORKER_IMAGE}"
: "${SMOKE_DATABASE_URL:?set SMOKE_DATABASE_URL}"
: "${SMOKE_S3_ENDPOINT:?set SMOKE_S3_ENDPOINT}"
SMOKE_S3_ACCESS_KEY="${SMOKE_S3_ACCESS_KEY:-watchdog}"
SMOKE_S3_SECRET_KEY="${SMOKE_S3_SECRET_KEY:-watchdog-smoke-secret}"
SMOKE_S3_BUCKET="${SMOKE_S3_BUCKET:-watchdog-evidence}"
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

# Placeholder secrets that only live for this run. Same shape a real install sets.
app_env=(
  -e "DATABASE_URL=$SMOKE_DATABASE_URL"
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
  docker logs "$name" 2>&1 | grep -q "migrate: done" || fail "$name did not report migrate: done"
done

echo "== 2. liveness, sign-in page, non-root"
curl -fsS "http://127.0.0.1:$port_a/api/v1/health" | grep -q '"ok":true' || fail "health"
signin="$(curl -fsS "http://127.0.0.1:$port_a/auth/sign-in" | tr -d '\0')"
[[ "$signin" == *"<html"* ]] || fail "sign-in page is not HTML"
[[ "$signin" == *"Sign in"* || "$signin" == *"sign-in"* ]] || fail "sign-in page has no sign-in content"
uid="$(docker exec "$SMOKE_PREFIX-web-a" id -u)"
[[ "$uid" != "0" ]] || fail "web container runs as root"
echo "uid=$uid"

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
until docker logs "$SMOKE_PREFIX-web-placeholder" 2>&1 | grep -q "BETTER_AUTH_SECRET is a placeholder"; do
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
docker run -d --name "$SMOKE_PREFIX-worker" --network host "${app_env[@]}" "$WORKER_IMAGE" >/dev/null
sleep 10
[[ "$(docker inspect -f '{{.State.Running}}' "$SMOKE_PREFIX-worker")" == "true" ]] || fail "worker stopped"
docker logs "$SMOKE_PREFIX-worker" 2>&1 | grep -q "skipping migrations" || fail "worker did not skip migrations"
[[ "$(docker exec "$SMOKE_PREFIX-worker" id -u)" != "0" ]] || fail "worker container runs as root"
# The log drain must have somewhere to write as a non-root user (WD_LOG_DIR): evlog prints this
# on every event when it does not.
for name in "$SMOKE_PREFIX-web-a" "$SMOKE_PREFIX-worker"; do
  if docker logs "$name" 2>&1 | grep -q "Failed to send events"; then
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
# A throwaway client container of the server's major version (pg_dump must not be older than the
# server). Same flags as the guide: custom format dump, pg_restore into an empty database.
pg_client() { docker run --rm -i --network host "$PG_CLIENT_IMAGE" "$@"; }
db_base="${SMOKE_DATABASE_URL%/*}"
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
original_migrations="$(count "${SMOKE_DATABASE_URL##*/}" "select count(*) from drizzle.__drizzle_migrations")"
[[ "$(count "$restore_db" "select count(*) from drizzle.__drizzle_migrations")" == "$original_migrations" ]] \
  || fail "the restored migration journal differs"
echo "dump $(wc -c <"$dump_file") bytes restored into $restore_db: admin and $original_migrations migrations present"

echo "smoke: ok"
