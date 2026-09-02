#!/usr/bin/env bash
# Web + worker in one terminal. Ctrl+C or either process exit stops both.
set -euo pipefail

cleanup() {
  trap - EXIT INT TERM
  local pid
  for pid in $(jobs -p); do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting web → http://127.0.0.1:3000"
pnpm dev:web &
pnpm dev:worker &
wait -n
status=$?
exit "$status"
