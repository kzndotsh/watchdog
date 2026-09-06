#!/usr/bin/env bash
# Apply Watchdog desloppify exclude patterns (idempotent). Used locally and in CI.
set -euo pipefail

if ! command -v desloppify >/dev/null 2>&1; then
  echo "desloppify not found — install with: uv pip install 'desloppify[full]'" >&2
  exit 1
fi

patterns=(
  _legacy-v1
  _legacy-v2
  graph
  data
  repos
  node_modules
  .venv
  .direnv
  dist
  .turbo
  packages/contract/src/generated
  packages/caps/capabilities.gen.json
  apps/web/src/routeTree.gen.ts
  apps/web/src/shared/ui/shadcn
  apps/web/src/auth/ui
  coverage
  playwright-report
  test-results
  export
  staging
  .wd-runtime
)

for pattern in "${patterns[@]}"; do
  if desloppify config show 2>/dev/null | grep -qF "$pattern"; then
    continue
  fi
  desloppify exclude "$pattern" >/dev/null 2>&1 || true
done
