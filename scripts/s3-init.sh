#!/usr/bin/env bash
# Create the Evidence bucket and its CORS rules on the local S3 server (SeaweedFS).
# Plain curl with SigV4, so there is no client to install. Idempotent.
set -euo pipefail

ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9100}"
ACCESS="${S3_ACCESS_KEY:-minioadmin}"
SECRET="${S3_SECRET_KEY:-minioadmin}"
BUCKET="${S3_BUCKET:-watchdog-evidence}"
REGION="${S3_REGION:-us-east-1}"
# Origins that may PUT straight to the bucket from the browser (presigned uploads).
ORIGINS="${S3_CORS_ORIGINS:-http://localhost:3000 http://127.0.0.1:3000}"

s3() {
  curl -sS --aws-sigv4 "aws:amz:${REGION}:s3" --user "${ACCESS}:${SECRET}" "$@"
}

status() {
  s3 -o /dev/null -w '%{http_code}' "$@"
}

cors_xml() {
  printf '<CORSConfiguration><CORSRule>'
  for origin in $ORIGINS; do printf '<AllowedOrigin>%s</AllowedOrigin>' "$origin"; done
  printf '<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>'
  printf '<AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule></CORSConfiguration>'
}

if [ "$(status -I "${ENDPOINT}/${BUCKET}")" != "200" ]; then
  code="$(status -X PUT "${ENDPOINT}/${BUCKET}")"
  if [ "$code" != "200" ]; then
    echo "Could not create bucket ${BUCKET} at ${ENDPOINT} (HTTP ${code}). Is the S3 server up? Try: just docker-up" >&2
    exit 1
  fi
fi

code="$(status -X PUT -H 'Content-Type: application/xml' --data "$(cors_xml)" "${ENDPOINT}/${BUCKET}?cors")"
if [ "$code" != "200" ]; then
  echo "Could not set CORS on ${BUCKET} (HTTP ${code})" >&2
  exit 1
fi

echo "Bucket ready: ${BUCKET} @ ${ENDPOINT}"
