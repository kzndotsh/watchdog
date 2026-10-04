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
  sources: scripts/check-effect-edges.mjs, docs/reference/platform/jobs-orpc.md
---

# Effect (Watchdog)

Single home for Watchdog Effect runtime doctrine. Not an Effect API tutorial.

## Outcomes

- **Clean** — change matches the edges below and the nearest package AGENTS.
- **Changed** — Effect code/allowlist updated to match doctrine.
- **Blocked** — needs a new `run*` edge or Layer; stop and ask before inventing one.

## Edit scope

May edit Effect programs under `packages/*` / `apps/*` and `scripts/check-effect-edges.mjs` when adding an allowlisted edge. Does not restore deleted identity Layers.

## Instructions

1. For Effect API syntax read [`node_modules/effect/AGENTS.md`](../../../node_modules/effect/AGENTS.md) completely, then search `node_modules/effect/src`. Then read the nearest package/app `AGENTS.md`.
2. Keep `DomainTag` / `ToolsTag` in `E` until a documented edge; do not `orDie` tagged domain failures mid-pipeline. Never throw in production: yield tagged errors. Defects stay defects.
3. `Effect.runPromise` / `runSync` / `appRuntime.runPromise` only on the `ALLOW` list in `scripts/check-effect-edges.mjs` (enforced by `pnpm check:effect-edges:strict`; tests are skipped). A new production `run*` goes on that list and its reason in the nearest `AGENTS.md`. `tryPromise` needs `{ try, catch }`.
4. Cap `interpret` stays pure/sync (may throw); Cap `run` is `Effect` (`CapRun`); tests use `runCap` / `itRunsCollectCap`.
5. Provide `toolsHttpClientLayer` once at Cap `run` / job collect / vitest root, not per HTTP call. Vendor clients export `*Effect` only.
6. Worker and Job execution, cancel, boss roles: [references/jobs.md](references/jobs.md).
7. Browser UI never imports the `@watchdog/policy` barrel: use `@watchdog/policy/patch-needs-confidence`.
8. Tests: `@effect/vitest` `it.effect` for sleeping/Layer programs; domain suites bridge with `runDomain` only.

## Gotchas

- Error channels: `DomainTag` (core services → `runApp` / `runDomain` / job `catchCause`), `ToolsTag` (CapContext I/O, tools HTTP → Cap fail path / `mapToolsCatch`), `CustodyViolationError` (`@watchdog/policy` gates → Accept / apply-patch). API maps `DomainTag` via `toOrpcError` / `Match.tagsExhaustive`; prefer `runApp`.
- The promise bridge inside `transact` (`runPromiseExitWith`: caller services, abort signal) and the export-coalesce `runSync` are intentional: do not "fix" them away.
- `AppLive` is `Layer.empty` until the phases in [ADR-0002](../../../docs/adr/0002-effect-services-and-layers.md) land. Until then call `tryDb` / module Effects; add Layers only as those phases.
- Do not copy Effect-guide patterns that Watchdog rejects: Effect `Schema` as domain SoT (wire stays Zod in `@watchdog/schemas`), `@effect/sql` / Model.Class (Postgres is Drizzle), `HttpApi` servers (HTTP is oRPC), `@effect/ai*` (`@watchdog/ai` uses the Vercel AI SDK). Library examples are not license to add `run*` sites.
