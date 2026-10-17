#!/bin/sh
# Create the Evidence bucket and its CORS rules on an S3-compatible server (SeaweedFS).
# Plain curl with SigV4, so there is no client to install. Idempotent. POSIX sh, so the
# production compose file can run it in the curl image (docker-compose.prod.yml, s3-init).
set -eu

ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9100}"
ACCESS="${S3_ACCESS_KEY:-watchdog}"
SECRET="${S3_SECRET_KEY:-watchdog-dev-secret}"
BUCKET="${S3_BUCKET:-watchdog-evidence}"
REGION="${S3_REGION:-us-east-1}"
# Origins that may PUT straight to the bucket from the browser (presigned uploads): the dev app
# on :3000 and the Playwright app on :3300. Space-separated; `*` is allowed.
ORIGINS="${S3_CORS_ORIGINS:-http://localhost:3000 http://127.0.0.1:3000 http://localhost:3300 http://127.0.0.1:3300}"

s3() {
  curl -sS --aws-sigv4 "aws:amz:${REGION}:s3" --user "${ACCESS}:${SECRET}" "$@"
}

status() {
  s3 -o /dev/null -w '%{http_code}' "$@"
}

cors_xml() {
  printf '<CORSConfiguration><CORSRule>'
  # Unquoted on purpose (split on spaces); globbing off so a `*` origin stays a literal `*`.
  set -f
  for origin in $ORIGINS; do printf '<AllowedOrigin>%s</AllowedOrigin>' "$origin"; done
  set +f
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
