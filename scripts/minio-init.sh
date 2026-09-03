#!/usr/bin/env bash
# Create MinIO Evidence bucket (CORS via docker-compose MINIO_API_CORS_ALLOW_ORIGIN).
# Prefer host `mc` (nix develop); fall back to `minio/mc` on the compose network.
set -euo pipefail

ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9100}"
ACCESS="${S3_ACCESS_KEY:-minioadmin}"
SECRET="${S3_SECRET_KEY:-minioadmin}"
BUCKET="${S3_BUCKET:-watchdog-evidence}"
MINIO_CONTAINER="${MINIO_CONTAINER:-watchdog-minio}"
MINIO_SERVICE_URL="${MINIO_SERVICE_URL:-http://minio:9000}"

ensure_bucket_with_host_mc() {
  mc alias set local "$ENDPOINT" "$ACCESS" "$SECRET" --api S3v4
  mc mb --ignore-existing "local/${BUCKET}"
}

ensure_bucket_with_docker_mc() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "minio-client (mc) required — install via nix develop / pkgs.minio-client, or ensure docker is available for the minio/mc fallback" >&2
    exit 1
  fi
  if ! docker inspect "$MINIO_CONTAINER" >/dev/null 2>&1; then
    echo "${MINIO_CONTAINER} is not running — run just docker-up first" >&2
    exit 1
  fi
  local network
  network="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$MINIO_CONTAINER")"
  if [[ -z "$network" ]]; then
    echo "${MINIO_CONTAINER} has no docker network" >&2
    exit 1
  fi
  # Host publish is 127.0.0.1-only; join the compose network and talk to service DNS.
  # MC_HOST_* avoids MinIO redirecting clients to localhost:9000.
  docker run --rm --network "$network" \
    -e "MC_HOST_local=http://${ACCESS}:${SECRET}@${MINIO_SERVICE_URL#http://}" \
    --entrypoint /bin/mc minio/mc:latest \
    mb --ignore-existing "local/${BUCKET}"
}

if command -v mc >/dev/null 2>&1; then
  ensure_bucket_with_host_mc
else
  ensure_bucket_with_docker_mc
fi

echo "Bucket ready: ${BUCKET} @ ${ENDPOINT}"
