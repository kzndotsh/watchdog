# Evlog contract

**What this is:** process logging rules for `@watchdog/log` / evlog.  
**What this is not:** Graph audit SoT (`Job.logs` / `graph_writes` / Triage Accept). Wiring (where the logger is installed): [`../platform/jobs-orpc.md`](../platform/jobs-orpc.md).

Package: [`@watchdog/log`](../../../packages/log/AGENTS.md). Do not depend on it from `apps/cli` or `@watchdog/client` (stdout is the agent contract). Enforced: oxlint `no-restricted-imports` for `apps/cli` (`oxlint.config.ts`); `client` declares no dependency.

## Rules

- **Never** `log.set({ error: someError })`: `JSON.stringify(Error)` drains as `error: {}`. Use `log.error(err)`, or `setLevel("warn")` + `{ name, message }`. Guidance (no lint rule).
- Auth denials are `warn` + `auth.denied`, not `error`. Guidance; set in `apps/web/src/start.ts`.
- Never log secrets, Evidence bodies, or Bearer / `x-api-key` plaintext. Partly enforced by the evlog redaction preset in `packages/log/src/init.ts`; otherwise guidance.
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

`Server-Timing`: in dev and test, API responses and server-function responses also carry `Server-Timing: db;dur=<db.ms>, app;dur=<durationMs>`. It is never sent when the validated `NODE_ENV` (`@watchdog/env`) is `production`; the log fields are not gated. There is no production opt-in.

## Gotchas

- **FS drain**: always compact NDJSON (`pretty: false` on `createFsDrain`); console `pretty` is separate. `redact.builtins: false` so CC/email/IP maskers do not corrupt case/evidence UUIDs; path redaction (`auditRedactPreset` + extras) stays.
