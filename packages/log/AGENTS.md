# Log package (`@watchdog/log`)

> Scope: `packages/log` (inherits root AGENTS.md)

Process logging via evlog (NDJSON + stdout). Contract SoT: [`docs/reference/contracts/evlog.md`](../../docs/reference/contracts/evlog.md).

## Commands

| Task       | Command                                 |
| ---------- | --------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/log typecheck` |
| Unit tests | `pnpm test:unit`                        |

## Do / Don't (package API)

| Do | Don't |
| --- | --- |
| Init once per process (`initWatchdogLogger`) | Depend from `packages/cli` or `packages/client` (stdout is the agent contract) |
| Use ALS (`peekRequestLogger` / `runWithRequestLogger`) under Start middleware | Call `createFsDrain().flush()` (no flush API; awaits per event) |
| Shape Cap Job events with `jobWideEventFields` from `JobRunOutcome` | — |
| Redact via `initWatchdogLogger` presets | — |

Error fields, auth/CSRF level, secrets, and “evlog ≠ Graph audit”: see [`evlog`](../../docs/reference/contracts/evlog.md).

## See also

| Need | File |
| --- | --- |
| Evlog contract | [`docs/reference/contracts/evlog.md`](../../docs/reference/contracts/evlog.md) |
| Platform wiring | [`docs/reference/platform/jobs-orpc.md`](../../docs/reference/platform/jobs-orpc.md) |
| Web Start middleware | [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) |
| Worker Cap Job emit | [`apps/worker/AGENTS.md`](../../apps/worker/AGENTS.md) |
