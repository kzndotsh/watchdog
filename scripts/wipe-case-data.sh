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
  echo "Also empties the MinIO evidence bucket (bucket stays)."
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
access="${S3_ACCESS_KEY:-minioadmin}"
secret="${S3_SECRET_KEY:-minioadmin}"
bucket="${S3_BUCKET:-watchdog-evidence}"

if command -v mc >/dev/null 2>&1; then
  mc alias set local "$endpoint" "$access" "$secret" --api S3v4 >/dev/null
  # Prefix wipe — keep the bucket. Empty bucket is not an error.
  mc rm --recursive --force "local/${bucket}/" >/dev/null 2>&1 || true
  echo "MinIO emptied: ${bucket} @ ${endpoint}"
else
  echo "mc not found — skipped MinIO empty (DB wipe still applied)" >&2
fi

echo "Wiped case data. Auth + vault credentials kept. Restart the worker if it was running."
