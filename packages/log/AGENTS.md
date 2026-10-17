# Log package (`@watchdog/log`)

> Scope: `packages/log` (inherits root AGENTS.md)

Process logging via evlog (NDJSON + stdout). Contract, error-field rules, and "evlog is not Graph audit": [`evlog`](../../docs/reference/contracts/evlog.md). Wiring: [`jobs-orpc`](../../docs/reference/platform/jobs-orpc.md). `apps/cli` and `packages/client` must not depend on it, since stdout is the agent contract (oxlint + `package.json`).

## Commands

| Task       | Command                                 |
| ---------- | --------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/log typecheck` |
| Unit tests | `pnpm test:unit`                        |

## Gotchas

- Init once per process with `initWatchdogLogger`; use ALS (`peekRequestLogger` / `runWithRequestLogger`) under Start middleware; shape Cap Job events with `jobWideEventFields`; bridge `Effect.log` via `evlogEffectLoggerLayer`.
- Request timing (`durationMs`, `db.queries`, `db.ms`, `Server-Timing`) lives in `request-timing.ts`; counts and times only, never SQL or bodies ([`evlog`](../../docs/reference/contracts/evlog.md#request-timing-fields)). `tryDb` is the only caller of `timedDbCall`.
- Keep redact `builtins: false` (the CC/email/IP maskers corrupt UUIDs) and use the path presets in `initWatchdogLogger`.
- `WD_LOG_DIR` overrides the drain directory (`resolveDrainDir`): the container image sets it under `/tmp` because the bundled app has no writable app directory. Unset keeps each app's own `.evlog/logs`.
- The FS drain has no flush API (`createFsDrain().flush()` does not exist; it awaits per event) and stays compact NDJSON (`pretty: false`), independent of console pretty-printing.
