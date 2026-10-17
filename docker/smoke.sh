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

echo "smoke: ok"
