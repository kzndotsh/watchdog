# Evlog contract

**What this is:** process logging rules for `@watchdog/log` / evlog.  
**What this is not:** Graph audit SoT (`Job.logs` / `graph_writes` / Triage Accept). Full wiring: [`../platform/jobs-orpc.md`](../platform/jobs-orpc.md#process-logging-evlog).

## Rules

| Do | Don’t |
| --- | --- |
| `log.error(err)` or `setLevel` + `{ name, message }` | `log.set({ error: someError })` (`JSON.stringify(Error)` → `{}`) |
| Auth denials as `warn` + `auth.denied` | Treat expected `UnauthorizedError` as `error` |
| Process observability only | Log secrets, Evidence bodies, Bearer / `x-api-key` plaintext |
| Keep `Job.logs` / `graph_writes` / Accept as custody SoT | Treat evlog NDJSON as Graph audit |

Package: [`@watchdog/log`](../../../packages/log/AGENTS.md). Never depend from `cli` / `client` (stdout is the agent contract).

## Gotchas

- **Evlog Error fields**: `log.set({ error: err })` drains as `error: {}`. Use `log.error(err)` or `setLevel("warn")` + `{ name, message }`. Auth denials are `warn` + `auth.denied`, not `error`.
