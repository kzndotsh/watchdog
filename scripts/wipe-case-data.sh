#!/usr/bin/env bash
# Empty Case Graph / Jobs / Inbox / Evidence. Keeps auth, API keys, vault credentials, schema.
set -euo pipefail

YES=0
for arg in "$@"; do
  case "$arg" in
    yes | --yes | -y) YES=1 ;;
    *)
      echo "Unknown arg: $arg (use yes / --yes)" >&2
      exit 2
      ;;
  esac
done
if [[ "${WIPE_YES:-}" == "1" ]]; then
  YES=1
fi

if [[ "$YES" -ne 1 ]]; then
  echo "Deletes all cases, entities, evidence, jobs, proposals, and tasks."
  echo "Keeps: login (auth.* including organizations), API keys, vault credentials, migrations."
  echo "Also empties the evidence bucket (it is recreated)."
  read -r -p "Type wipe to continue: " answer
  if [[ "$answer" != "wipe" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

url="${DATABASE_URL_MIGRATE:-${DATABASE_URL:-}}"
if [[ -z "$url" ]]; then
  echo "DATABASE_URL_MIGRATE or DATABASE_URL required" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql required — use nix develop" >&2
  exit 1
fi

psql "$url" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  stmt text;
BEGIN
  SELECT
    'TRUNCATE TABLE '
    || string_agg(format('%I.%I', schemaname, tablename), ', ')
    || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> ALL (ARRAY['credentials', '__drizzle_migrations']);

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;

  SELECT
    'TRUNCATE TABLE '
    || string_agg(format('%I.%I', schemaname, tablename), ', ')
    || ' RESTART IDENTITY CASCADE'
  INTO stmt
  FROM pg_tables
  WHERE schemaname = 'pgboss'
    AND tablename IN ('job', 'archive');

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM auth."user") AS users,
  (SELECT count(*) FROM credentials) AS credentials,
  (SELECT count(*) FROM cases) AS cases,
  (SELECT count(*) FROM entities) AS entities,
  (SELECT count(*) FROM evidence) AS evidence,
  (SELECT count(*) FROM jobs) AS jobs,
  (SELECT count(*) FROM proposals) AS proposals,
  (SELECT count(*) FROM tasks) AS tasks;
SQL

endpoint="${S3_ENDPOINT:-http://127.0.0.1:9100}"
access="${S3_ACCESS_KEY:-watchdog}"
secret="${S3_SECRET_KEY:-watchdog-dev-secret}"
bucket="${S3_BUCKET:-watchdog-evidence}"

# SeaweedFS has no recursive delete over the S3 API from the shell, so drop the bucket (and its
# objects) with `weed shell` inside the container, then recreate it with its CORS rules.
S3_CONTAINER="${S3_CONTAINER:-watchdog-s3}"
if docker inspect "$S3_CONTAINER" >/dev/null 2>&1; then
  docker exec -i "$S3_CONTAINER" weed shell -master=localhost:9333 >/dev/null 2>&1 \
    <<<"s3.bucket.delete -name ${bucket}" || true
  S3_ENDPOINT="$endpoint" S3_ACCESS_KEY="$access" S3_SECRET_KEY="$secret" S3_BUCKET="$bucket" \
    bash "$(dirname "$0")/s3-init.sh" >/dev/null
  echo "Evidence bucket emptied: ${bucket} @ ${endpoint}"
else
  echo "${S3_CONTAINER} is not running — skipped emptying the evidence bucket (DB wipe still applied)" >&2
fi

echo "Wiped case data. Auth + vault credentials kept. Restart the worker if it was running."
