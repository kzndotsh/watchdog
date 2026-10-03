# Evlog contract

**What this is:** process logging rules for `@watchdog/log` / evlog.  
**What this is not:** Graph audit SoT (`Job.logs` / `graph_writes` / Triage Accept). Wiring (where the logger is installed): [`../platform/jobs-orpc.md`](../platform/jobs-orpc.md).

Package: [`@watchdog/log`](../../../packages/log/AGENTS.md). Do not depend on it from `apps/cli` or `@watchdog/client` (stdout is the agent contract). Enforced: oxlint `no-restricted-imports` for `apps/cli` (`oxlint.config.ts`); `client` declares no dependency.

## Rules

- **Never** `log.set({ error: someError })`: `JSON.stringify(Error)` drains as `error: {}`. Use `log.error(err)`, or `setLevel("warn")` + `{ name, message }`. Guidance (no lint rule).
- Auth denials are `warn` + `auth.denied`, not `error`. Guidance; set in `apps/web/src/start.ts`.
- Never log secrets, Evidence bodies, or Bearer / `x-api-key` plaintext. Partly enforced by the evlog redaction preset in `packages/log/src/init.ts`; otherwise guidance.
- evlog NDJSON is process observability, not Graph audit. `Job.logs`, `graph_writes` and Triage Accept stay the custody SoT. Breach Caps may store recovered credential fields in Evidence artifacts ([`caps-lexicon.md` D5](../platform/caps-lexicon.md#pre-code-decisions-locked)); that material belongs in the case file, never in process logs.

## Gotchas

- **FS drain**: always compact NDJSON (`pretty: false` on `createFsDrain`); console `pretty` is separate. `redact.builtins: false` so CC/email/IP maskers do not corrupt case/evidence UUIDs; path redaction (`auditRedactPreset` + extras) stays.
