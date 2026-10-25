#!/usr/bin/env bash
# Web + marketing site + worker in one terminal.
#
# - A service exiting on its own stops the others and this script exits with its code.
# - Ctrl+C (INT) or TERM stops everything and exits 0, so `just dev` does not report a failure.
#
# Each service runs in its own process group (`set -m`) and gets exactly one signal, from here.
# Left in the terminal's group, a service receives Ctrl+C's SIGINT and then a second one
# from whoever wraps it: `tsx watch` relays its signal to the worker, which treats a repeated
# signal as "force exit" and never finishes its graceful shutdown (and `tsx` itself prints
# "Previous process hasn't exited yet. Force killing..."). So Ctrl+C reaches only this script,
# which forwards it once and waits up to WD_DEV_GRACE_SECONDS (default 10) for the services;
# a second Ctrl+C, or the end of the grace period, force-kills what is left.
#
# The services run their package `dev` script directly, not through `pnpm`, which would report
# the 130 exit of an interrupted service as ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL.
#
# WD_WEB_PORT and WD_SITE_PORT (default 3000 and 3001, integers 1-65535) replace the `--port` in
# those scripts, to run a second checkout beside this one. Bad values are refused (exit 2).
set -uo pipefail
set -m

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web_port="${WD_WEB_PORT:-3000}"
site_port="${WD_SITE_PORT:-3001}"
grace_seconds="${WD_DEV_GRACE_SECONDS:-10}"

die() {
  echo "dev: $*" >&2
  exit 2
}

if [[ ! "$grace_seconds" =~ ^[0-9]+$ ]]; then
  die "WD_DEV_GRACE_SECONDS must be a non-negative integer, got '${grace_seconds}'"
fi
for name in WD_WEB_PORT WD_SITE_PORT; do
  value="${!name:-3000}"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || ((10#$value < 1 || 10#$value > 65535)); then
    die "$name must be an integer from 1 to 65535, got '${value}'"
  fi
done
grace_seconds=$((10#$grace_seconds))
web_port=$((10#$web_port))
site_port=$((10#$site_port))

signal=""
signals=0

on_int() { signal="${signal:-INT}"; signals=$((signals + 1)); }
on_term() { signal="${signal:-TERM}"; signals=$((signals + 1)); }
trap on_int INT
trap on_term TERM

# command_of <app> [port]: apps/<app>'s `dev` script, with its --port replaced when one is given.
# Resolved for every app before any is launched, so a bad package.json starts nothing.
command_of() {
  local cmd
  cmd="$(cd "$root/apps/$1" && node -e "const c = require('./package.json').scripts?.dev; if (!c) process.exit(1); console.log(c)")" ||
    die "apps/$1/package.json has no dev script"
  if [[ -n "${2:-}" ]]; then
    cmd="$(printf '%s' "$cmd" | sed -E "s/--port [0-9]+/--port $2/")"
  fi
  printf '%s' "$cmd"
}

# launch <app> <command>: run it as a background job, as `pnpm run` would (the app's and the
# root's node_modules/.bin on PATH) but with no pnpm between us and the process. Skipped once a
# signal has arrived.
launch() {
  [[ -n "$signal" ]] && return 0
  local dir="$root/apps/$1"
  (cd "$dir" && PATH="$dir/node_modules/.bin:$root/node_modules/.bin:$PATH" exec bash -c "exec $2") </dev/null &
}

running() { [[ -n "$(jobs -pr)" ]]; }

# Wait for every service to exit; after the grace period (or a second signal), SIGKILL the rest.
drain() {
  local ticks=0
  while running && ((ticks < grace_seconds * 10 && signals < 2)); do
    sleep 0.1
    ticks=$((ticks + 1))
  done
  if running; then
    echo "dev: services still running, killing them" >&2
    local pid
    for pid in $(jobs -pr); do
      kill -KILL -- "-$pid" 2>/dev/null || true # the whole group: tsx's child too
    done
  fi
  wait 2>/dev/null || true
}

web_cmd="$(command_of web "$web_port")" || exit $?
site_cmd="$(command_of site "$site_port")" || exit $?
worker_cmd="$(command_of worker)" || exit $?

echo "Starting web → http://127.0.0.1:${web_port} · site → http://127.0.0.1:${site_port}"
launch web "$web_cmd"
launch site "$site_cmd"
launch worker "$worker_cmd"

# `wait -n` also returns when a trapped signal arrives; `signal` tells the two apart. A signal
# that arrived while starting up must not reach `wait -n`, which would then block for good.
status=0
if [[ -z "$signal" ]]; then
  wait -n
  status=$?
fi

if [[ -n "$signal" ]]; then
  kill "-$signal" $(jobs -pr) 2>/dev/null || true
  drain
  exit 0
fi

# A service exited on its own: stop the others and propagate its code.
echo "dev: a service exited with code ${status}, stopping the others" >&2
kill -TERM $(jobs -pr) 2>/dev/null || true
drain
exit "$status"
