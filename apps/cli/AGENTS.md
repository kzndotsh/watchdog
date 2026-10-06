# CLI app (`@watchdog/cli`)

> Scope: `apps/cli` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

`wd`: the agent-facing CLI. It reaches the API only through `@watchdog/client` (imports of core/db/api/env/log are banned in `oxlint.config.ts`); the binary export routes use authenticated `fetch` because they are not on the oRPC contract. Command surface, flags and output shapes: `wd --help`, `src/commands/`, [`agent-cli`](../../docs/how-to/agent-cli.md).

## Commands

| Task | Command |
| --- | --- |
| Run (dev) | `pnpm exec wd -- <args>` · `pnpm --filter @watchdog/cli dev -- <args>` |
| Build | `pnpm --filter @watchdog/cli build` (esbuild single ESM → `dist/main.js`; workspace packages inlined) |
| Pack proof | `pnpm --filter @watchdog/cli pack:smoke` · `--live` with `WD_API_*` |
| Typecheck (src + tests) | `pnpm --filter @watchdog/cli typecheck` |
| Unit tests | `pnpm test:unit` |

## Contract

- Output is compact JSON on stdout by default. Errors are `{ "ok": false, "error": { "code", "message" } }` on stdout, where `code` is the stable error code (`not_found`, `internal`, ...; see [contracts](../../docs/reference/contracts/README.md#error-taxonomy)); `WD_CLI_DEBUG=1` adds stack and cause on stderr. Exit codes: 1 error, 2 unknown flag, 3 server-side failure (HTTP 5xx / `InternalError`, including binary downloads).
- `WD_API_URL` (default `http://localhost:3000/api/v1`) + `WD_API_KEY` load via `loadCliEnv()` in `src/env.ts`, validated on first API use, not on `--help`. A key acts in one organization (`metadata.organizationId`; legacy keys act in the owner's oldest organization); a foreign-org `caseId` is `not_found`, no organization is 403. Dotenv loads from the cwd, then parent directories.
- Custody (guidance plus tests in `custody.test.ts`): default to `wd proposals create`. Child Graph writes need `--user-override` and refuse `confirmed` (the rule is `childWriteViolation` in `@watchdog/policy`, shared with the API; `custody.ts` only maps it to a `CUSTODY` envelope); `wd graph write` always sends `userOverride: true`. Only `wd proposals accept --confidence` may set `confirmed`. Secrets go through `wd credentials`, never argv or `Job.input`.

## Gotchas

- `wd jobs start -i` must be a JSON object, not an array or bare string.
- `--dry-run` on destructive verbs prints the planned JSON only; it does not validate against the API.
- `wd evidence process|enrich` is the Intake path (dedupes active Jobs, asserts http(s)); `wd jobs start --cap evidence.harvest` works but skips that glue.
- File uploads PUT to the presigned URL with exactly the `headers` the server returns, including the signed `x-amz-meta-sha256`.
- Update verbs take partial patches (at least one field). For `identifiers` / `claims` / `edges`, `--notes ""` and `--evidence ""` clear the field; omitting the flag leaves it.
- Brand at the edge (ADR-0003): `--case` goes through `requireCaseId` (`parseTrimmedCaseId`, returns `CaseId`) and every other positional uuid through `requireUuid` (`parseTrimmedUuid`, plain string); an invalid id is a `USAGE` error via `fail`, never a throw and never a cast.
