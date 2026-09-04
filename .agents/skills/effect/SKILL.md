---
name: effect
description: >-
  Use when writing or reviewing Effect code in Watchdog (core, api, caps,
  tools, worker, policy) — tagged E, run* edges, JobFibers/cancel, Cap run,
  HttpClient layers, or browser Effect boundaries. Trigger on Effect.gen,
  DomainTag, ToolsTag, runApp, runDomain, JobFibers, toolsHttpClientLayer,
  or "how should Effect look here". Do NOT trigger for generic Effect API
  docs alone — read `node_modules/effect/AGENTS.md` first; this skill is
  Watchdog runtime conventions only.
metadata:
  owner: watchdog
  sources: packages/core/AGENTS.md, packages/api/AGENTS.md, packages/cap-sdk/AGENTS.md, packages/tools/AGENTS.md, apps/worker/AGENTS.md, scripts/check-effect-edges.mjs, docs/reference/platform/jobs-orpc.md
---

# Effect (Watchdog)

Watchdog Effect runtime conventions. Not an Effect API tutorial.

## Outcomes

- **Clean** — change matches edges + nearest package AGENTS.
- **Changed** — Effect code/docs/allowlist updated to match doctrine.
- **Blocked** — needs a new `run*` edge or Layer; stop and ask before inventing one.

## Edit scope

May edit Effect programs under `packages/*` / `apps/*` and `scripts/check-effect-edges.mjs` when adding an allowlisted edge. Does not restore deleted identity Layers.

## Instructions

1. Read the nearest package/app `AGENTS.md` Gotchas, then this skill. For Effect API syntax, read [`node_modules/effect/AGENTS.md`](../../../node_modules/effect/AGENTS.md) completely (then `node_modules/effect/src` as needed) — curated Watchdog map: [references/llms.md](references/llms.md).
2. Keep `DomainTag` / `ToolsTag` in `E` until a documented edge: API `runApp`, job `catchCause`, Cap `runCap` / collect. Do not `orDie` tagged domain failures away mid-pipeline.
3. Never add `Effect.runPromise` / `runSync` / `appRuntime.runPromise` outside the allowlist — load [references/edges.md](references/edges.md).
4. Cap `interpret` stays pure/sync (may throw). Cap `run` is `Effect` (`CapRun`); tests use `runCap` / `itRunsCollectCap`.
5. Provide `toolsHttpClientLayer` once at Cap `run` / job collect / vitest root — not per HTTP call.
6. Worker: `bootWorkerEffect` + one `JobFibers.layer`. Cancel sets `"timeout"|"cancel"` **before** Fiber interrupt. Product SoT stays `jobs.status`. Details: [references/jobs.md](references/jobs.md).
7. Browser UI: never import `@watchdog/policy` barrel — use `@watchdog/policy/patch-needs-confidence`.
8. Tests: `@effect/vitest` `it.effect` for sleeping/Layer programs; domain suites bridge with `runDomain` only.

## Gotchas

- Nested `runPromise` inside `transact` and export coalesce `runSync` are intentional — do not “fix” them away.
- `AppLive` is `Layer.empty`. Call `tryDb` / module Effects; do not revive Postgres/Vault/JobQueue/repo identity Layers.
- `pnpm check:effect-edges:strict` gates run* + `throw new DomainError` in production.
- LLMS prefers Effect Schema / `@effect/sql` / HttpApi — Watchdog does **not**; see [references/llms.md](references/llms.md) “Do not copy”.
