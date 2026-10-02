#!/usr/bin/env bash
# Create MinIO Evidence bucket (CORS via docker-compose MINIO_API_CORS_ALLOW_ORIGIN).
# Prefer host `mc` (nix develop); fall back to the `mc` bundled in the MinIO server container.
set -euo pipefail

ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9100}"
ACCESS="${S3_ACCESS_KEY:-minioadmin}"
SECRET="${S3_SECRET_KEY:-minioadmin}"
BUCKET="${S3_BUCKET:-watchdog-evidence}"
MINIO_CONTAINER="${MINIO_CONTAINER:-watchdog-minio}"

ensure_bucket_with_host_mc() {
  mc alias set local "$ENDPOINT" "$ACCESS" "$SECRET" --api S3v4
  mc mb --ignore-existing "local/${BUCKET}"
}

ensure_bucket_with_docker_mc() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "minio-client (mc) required — install via nix develop / pkgs.minio-client, or ensure docker is available for the in-container mc fallback" >&2
    exit 1
  fi
  if ! docker inspect "$MINIO_CONTAINER" >/dev/null 2>&1; then
    echo "${MINIO_CONTAINER} is not running — run just docker-up first" >&2
    exit 1
  fi
  # The MinIO server image (ghcr.io/coollabsio/minio) ships its own `mc`, so no separate
  # client image is pulled (the Hub and Quay mc images are private). Inside the container
  # MinIO is on localhost:9000; MC_HOST_* avoids an alias round-trip.
  docker exec \
    -e "MC_HOST_local=http://${ACCESS}:${SECRET}@localhost:9000" \
    "$MINIO_CONTAINER" mc mb --ignore-existing "local/${BUCKET}"
}

if command -v mc >/dev/null 2>&1; then
  ensure_bucket_with_host_mc
else
  ensure_bucket_with_docker_mc
fi

echo "Bucket ready: ${BUCKET} @ ${ENDPOINT}"
