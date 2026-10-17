#!/usr/bin/env bash
# Create .env for local development from env.example: the secrets are generated, the database
# and object-store values are the ones the dev docker-compose.yml starts. Never overwrites an
# existing .env (`just env`).
#
# env.example ships every secret blank on purpose: startup refuses a placeholder or a short
# secret, so a copied example can never run with a shared default.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${ENV_FILE:-$root/.env}"

if [[ -e "$target" ]]; then
  echo "$target exists: left alone (delete it to start over)"
  exit 0
fi

cp "$root/env.example" "$target"
chmod 600 "$target"

# set_var NAME VALUE: fill `NAME=` (blank) or uncomment `# NAME=`.
set_var() {
  local name="$1" value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')"
  # No `sed -i`: BSD (macOS) and GNU sed disagree on its argument, so write a copy and move it.
  sed -E "s|^#? ?${name}=.*$|${name}=${escaped}|" "$target" >"$target.tmp"
  mv "$target.tmp" "$target"
  chmod 600 "$target"
}

set_var BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
set_var WD_MASTER_VAULT_KEY "$(openssl rand -base64 32)"
# The dev stack (docker-compose.yml, docker/postgres/init.sql) creates these accounts.
set_var DATABASE_URL "postgresql://watchdog_app:watchdog@127.0.0.1:5432/watchdog"
set_var DATABASE_URL_MIGRATE "postgresql://postgres:postgres@127.0.0.1:5432/watchdog"
set_var S3_SECRET_KEY "watchdog-dev-secret"

echo "Wrote $target with generated secrets. Next: just up, then just admin"
