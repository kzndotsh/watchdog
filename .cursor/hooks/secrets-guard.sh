#!/bin/sh
# beforeReadFile guard: deny reads of secret material before it reaches the
# model. Pure POSIX shell, no node — Cursor spawns hooks without the
# project's nix devshell on PATH, so a node-dependent script here would fail
# to resolve `node` and, with failClosed: true, block every read. /bin/sh is
# resolved by the kernel via this file's shebang, not a PATH lookup.
set -eu

input=$(cat)

# grep exits 1 on no match; with set -e that aborts before the empty-path
# allow below. Cursor also uses "path" for some reads (e.g. transcripts).
extract_path_field() {
  field=$1
  printf '%s' "$input" \
    | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" 2>/dev/null \
    | head -n 1 \
    | sed -E 's/.*:[[:space:]]*"(.*)"/\1/' \
    || true
}

file_path=$(extract_path_field file_path)
if [ -z "$file_path" ]; then
  file_path=$(extract_path_field path)
fi

if [ -z "$file_path" ]; then
  printf '{"permission":"allow"}'
  exit 0
fi

case "$file_path" in
  *.example | *.sample | *.template)
    printf '{"permission":"allow"}'
    exit 0
    ;;
esac

case "$file_path" in
  */.env | */.env.* | .env | .env.* | *.pem | *.key | *.pfx | *.p12 \
    | */id_rsa | */id_ed25519 | */id_ecdsa | */id_dsa \
    | */credentials.json | credentials.json | */.ssh/*)
    base=$(basename "$file_path")
    printf '{"permission":"deny","user_message":"Blocked read of %s - looks like secret material. Use the vault (ctx.getCredential) or ask the user for the value instead of reading it from disk."}' "$base"
    exit 0
    ;;
esac

printf '{"permission":"allow"}'
