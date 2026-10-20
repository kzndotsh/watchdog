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
- Redaction is `builtins: ["secrets"]` plus `auditRedactPreset` and one extra path (`x-api-key`). `secrets` is key-name based (keys ending `password`, `passwd`, `secret`, `token`, any depth). Never enable the other builtins: the CC/email/IP/phone maskers match values and corrupt case/evidence UUIDs. Add a path to `EXTRA_REDACT_PATHS` only when neither covers it, with a reason.
- `WD_LOG_DIR` overrides the drain directory (`resolveDrainDir`): the container image sets it under `/tmp` because the bundled app has no writable app directory. Unset keeps each app's own `.evlog/logs`.
- The FS drain has no flush API (`createFsDrain().flush()` does not exist; it awaits per event) and stays compact NDJSON (`pretty: false`), independent of console pretty-printing.
- Error reporting (#312): optional, off without `WD_ERROR_REPORTING_DSN`. Vendor decision: a vendor-neutral `ErrorSink` whose one implementation speaks the Sentry envelope protocol with plain `fetch` (`sentry-sink.ts`), not `@sentry/*`, so a DSN works for Sentry, GlitchTip and Bugsink with zero dependencies, bundle cost or Node patching. Reports flow from the drain (`reportWideEvent`) and scrub twice (evlog redaction, then `error-scrub.ts`); keep the context an allowlist ([`evlog`](../../docs/reference/contracts/evlog.md#error-reporting)). Tests that call `initWatchdogLogger` with a DSN must stub `process.on` or the exit-on-uncaught handlers outlive the test.
- OTLP export (#410): optional, off without `WD_OTLP_ENDPOINT`; `otlp-export.ts` wires evlog's `createOTLPDrain` behind `createDrainPipeline` and scrubs every event with `error-scrub.ts` (the one scrubber: never add another). `push` never throws or waits; failures are counted, never logged (a log line would be exported again). Tests that init the logger with `otlp` must close their receiver sockets ([`evlog`](../../docs/reference/contracts/evlog.md#log-export-otlp)).
