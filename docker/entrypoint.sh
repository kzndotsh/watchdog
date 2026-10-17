#!/bin/sh
# Shared entrypoint of the `web` and `worker` image targets.
#
# 1. Unless WD_SKIP_MIGRATIONS is truthy, apply pending migrations with the bundled migrator
#    (migrate.mjs: the same drizzle migrator `pnpm db:migrate` uses, minus drizzle-kit). It
#    connects with DATABASE_URL_MIGRATE, else DATABASE_URL, and holds a Postgres advisory lock
#    while it works, so replicas starting together take turns instead of racing.
# 2. A failed migration exits non-zero here, before the app starts: the container never serves
#    against a half-migrated schema, and a restart policy retries.
# 3. exec the command (CMD), so the app is PID 1 and receives SIGTERM.
#
# WD_SKIP_MIGRATIONS: 1/true/yes/on skips, 0/false/no/off/empty runs. The web target runs
# migrations by default; the worker target sets it to 1 (the web container migrates, the worker
# only needs the schema to exist). Any other value is a configuration error.
set -eu

skip="$(printf '%s' "${WD_SKIP_MIGRATIONS:-0}" | tr '[:upper:]' '[:lower:]')"

case "$skip" in
  1 | true | yes | on)
    echo "entrypoint: WD_SKIP_MIGRATIONS=${WD_SKIP_MIGRATIONS}, skipping migrations"
    ;;
  0 | false | no | off | "")
    node "${WD_MIGRATE_SCRIPT:-/app/migrate.mjs}"
    ;;
  *)
    echo "entrypoint: WD_SKIP_MIGRATIONS must be 1 or 0, got '${WD_SKIP_MIGRATIONS}'" >&2
    exit 64
    ;;
esac

exec "$@"
