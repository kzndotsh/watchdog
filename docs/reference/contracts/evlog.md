# Evlog contract

**What this is:** process logging rules for `@watchdog/log` / evlog.  
**What this is not:** Graph audit SoT (`Job.logs` / `graph_writes` / Triage Accept). Wiring (where the logger is installed): [`../platform/jobs-orpc.md`](../platform/jobs-orpc.md).

Package: [`@watchdog/log`](../../../packages/log/AGENTS.md). Do not depend on it from `apps/cli` or `@watchdog/client` (stdout is the agent contract). Enforced: oxlint `no-restricted-imports` for `apps/cli` (`oxlint.config.ts`); `client` declares no dependency.

## Rules

- **Never** `log.set({ error: someError })`: `JSON.stringify(Error)` drains as `error: {}`. Use `log.error(err)`, or `setLevel("warn")` + `{ name, message }`. Guidance (no lint rule).
- Auth denials are `warn` + `auth.denied`, not `error`. Guidance; set in `apps/web/src/start.ts`.
- Never log secrets, Evidence bodies, or Bearer / `x-api-key` plaintext. Partly enforced by evlog redaction in `packages/log/src/init.ts` (the `secrets` builtin, `auditRedactPreset` and `x-api-key`); otherwise guidance. Redaction is by key name: a secret under a key that does not end in `password`, `passwd`, `secret` or `token` and is not in the preset (for example `masterVaultKey`) is not redacted.
- evlog NDJSON is process observability, not Graph audit. `Job.logs`, `graph_writes` and Triage Accept stay the custody SoT. Breach Caps may store recovered credential fields in Evidence artifacts ([`caps-lexicon.md` D5](../platform/caps-lexicon.md#pre-code-decisions-locked)); that material belongs in the case file, never in process logs.

## Request timing fields

Every API route and every server function emits one request wide event, and it carries the time and database work of that request:

| Field | Type | Meaning |
| --- | --- | --- |
| `durationMs` | number | Wall time of the request, from the start of the logger middleware to the response (0.1 ms resolution). For a streamed response, to the point the headers go out |
| `db.queries` | number | Database calls the request made through core's `tryDb` / `tryDbWith` / `tryDbOn` seam, including those inside a `transact` body (the transaction's own BEGIN / COMMIT is not counted) |
| `db.ms` | number | Total time of those calls, summed. Overlapping calls add up, so it can exceed `durationMs` |

Types: `RequestTimingLogFields` and `DbLogFields` in `packages/log/src/fields.ts`. The accumulator is `packages/log/src/request-timing.ts`: it hangs off the request logger already in AsyncLocalStorage (`runWithRequestLogger`), `tryDb` calls `timedDbCall` once per statement, and `apps/web/src/start.ts` starts it and writes the totals before the event is emitted. Outside a request (worker, CLI, a test with no request logger) `timedDbCall` finds no accumulator, allocates nothing and just runs the call. `db.queries` counts calls to the seam, so a repo function that runs two statements in one `tryDb` counts once; the statement-exact oracle is `captureStatements` ([testing standards](../../contributing/testing/standards.md#query-count-budgets-and-plan-assertions)).

**Counts and times only.** The timing fields are numbers: never SQL text, parameters, rows, request or response bodies, or Evidence content. Do not add any of those to the request event when extending it. Tested in `apps/web/src/__tests__/start-timing.test.ts` (the event's keys) and `packages/core/src/infra/__tests__/request-timing.int.test.ts` (the count against the statement log).

`Server-Timing`: in dev and test, API responses and server-function responses also carry `Server-Timing: db;dur=<db.ms>, app;dur=<durationMs>`. It is sent only when the validated `NODE_ENV` (`@watchdog/env`) is `development` or `test` (an allowlist, so never in production); the log fields are not gated. There is no production opt-in.

## Error reporting

Optional, off unless `WD_ERROR_REPORTING_DSN` is set (`@watchdog/env/server`); then `initWatchdogLogger({ errorReporting })` installs a sink behind the logger. Operator guide: [`self-host`](../../how-to/self-host.md#error-reporting).

- **One path.** The logger's drain hands every wide event to `reportWideEvent` (`packages/log/src/error-report.ts`): an event reports when its level is `error` or `fatal`, or its status is 5xx (a mapped `InternalError` sets its cause as a field, not a level). Uncaught exceptions and unhandled rejections report through `reportError` and then exit 1 as Node would; those handlers are installed only when reporting is on. The browser posts to `/api/client-errors`, which logs an `error` event, so it takes the same path.
- **Context is an allowlist**: `requestId`, `method`, `path`, `status`, `operation`, `scope`, `jobId`, `capabilityId`, plus `release`, `environment` and `service`. Never add bodies, headers, SQL or Evidence content.
- **Scrubbing** (`error-scrub.ts`) runs after evlog's redaction, on the report, not the log: keys that name a secret, body, Evidence content or a person are dropped; sensitive env values are removed verbatim; bearer tokens, URL credentials and queries, JWTs, emails and long opaque tokens are removed from strings. Tested in `packages/log/src/__tests__/error-report.test.ts`.
- **A reporter never fails or slows a request**: `reportError` returns at once, the send is not awaited, is rate limited (30 a minute, 10 in flight), has a 3 s timeout and swallows every failure.
- **Vendor-neutral sink** (`ErrorSink`): the only implementation is `sentry-sink.ts`, the Sentry envelope protocol over `fetch` (Sentry, GlitchTip, Bugsink). It is not the Sentry SDK on purpose: no dependency, no bundle cost, no Node patching.

## Gotchas

- **FS drain**: always compact NDJSON (`pretty: false` on `createFsDrain`); console `pretty` is separate. `redact.builtins` is `["secrets"]` only: it redacts every key ending in `password`, `passwd`, `secret` or `token` at any depth. The CC/email/IP/phone maskers stay off because they corrupt case/evidence UUIDs. `auditRedactPreset` covers `authorization`, `cookie`, `set-cookie`, `apiKey` and similar; `x-api-key` is the one Watchdog-specific path (it ends in `key`).
