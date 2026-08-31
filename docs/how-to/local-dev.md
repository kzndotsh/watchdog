# Local development

**What this is:** `just` / docker lifecycle, wipe, test databases, MinIO, toolchain traps.  
**What this is not:** first-time signup ([`onboarding.md`](onboarding.md)).

## Gotchas

- `@tanstack/devtools-vite` skill text still says Vite ^6 \|\| ^7; CLI ships **Vite 8** — builds succeed; watch for plugin warnings.
- `pnpm.onlyBuiltDependencies` in package.json is ignored on pnpm 11 — use `allowBuilds` in `pnpm-workspace.yaml` (esbuild, lightningcss).
- Do not invent Next.js patterns (`app/` router, `"use server"`, etc.).
- `routeTree.gen.ts` is generated — run `pnpm generate-routes` or `pnpm dev` after route file changes.
