# Effect run* edges

Load this when: adding or reviewing `Effect.runPromise` / `runSync` /
`appRuntime.runPromise`, mapping domain errors to HTTP/CLI, or changing
tagged `E` channels.

## Allowlist (`scripts/check-effect-edges.mjs`)

| Path | Role |
| --- | --- |
| `packages/api/src/runtime.ts` | `runApp` → ORPCError then `appRuntime.runPromise` |
| `apps/worker/src/boot-worker.ts` | `NodeRuntime.runMain` / process Cap batch / signal `runFork` |
| `packages/core/src/infra/run-domain.ts` | Test/compat `runDomain` |
| `packages/core/src/infra/postgres-tx.ts` | Nested `runPromise` inside Drizzle `transact` |
| `packages/core/src/infra/export-sync.ts` | Coalesce claim via `runSync` |
| `packages/cap-sdk/src/run.ts` | `runCap` Promise edge (provides `toolsHttpClientLayer`) |

New production `run*` → add to this allowlist **and** document why in the
nearest `AGENTS.md`. Tests under `__tests__` / `*.test.ts` are skipped by
the gate.

## Error channels

| Channel | Where | Edge |
| --- | --- | --- |
| `DomainTag` | core services | `runApp` / `runDomain` / job `catchCause` |
| `ToolsTag` | CapContext I/O, tools HTTP | Cap fail path / `mapToolsCatch` |
| `CustodyViolation` | `@watchdog/policy` gates | Accept / apply-patch |
| defects | unexpected | stay defects; do not silence with `orDie` |

API: `toOrpcError` / `Match.tagsExhaustive` on `DomainTag` only. Prefer
`runApp`. Never `throw new DomainError` in production — yield tagged errors.

## HttpClient

`fetchJson*` / `fetchBytes*` require `HttpClient` in `R`. Provide
`toolsHttpClientLayer` once at Cap/job/test root. Vendor clients export
`*Effect` only.
