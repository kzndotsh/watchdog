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

- Output is compact JSON on stdout by default. Errors are `{ "ok": false, "error": { "code", "message" } }` on stdout, where `code` is the stable error code (`not_found`, `internal`, ...; see [contracts](../../docs/reference/contracts/README.md#error-taxonomy)); `WD_CLI_DEBUG=1` adds stack and cause on stderr. `wd auth status` prints the credential kind, key id, scopes and organization (`auth.whoami`). A key without the scope a verb needs gets `insufficient_scope` (the message names the scope, the help says to create a key with it in Settings → API Keys). Exit codes: 1 error, 2 unknown flag, 3 server-side failure (HTTP 5xx / `InternalError`, including binary downloads).
- Lists are paged: every `wd <noun> list` (not `caps` or `credentials`, which are static) takes `--limit <1-200>` (default 50), `--cursor <nextCursor>` and `--all`, and prints `{ count, items, nextCursor }` (`nextCursor` is `null` on the last page; `--table` prints `next: --cursor <value>` on stderr). `--all` reads every page and so has no `nextCursor`. `wd jobs list` shows a playbook run as one row, so it reads on past the requested page (up to 20 pages) until each run on it has its step 0. Internal lookups that need a whole list (`resolveEntityId`, job input titles) use `fetchAllItems` (`src/paging.ts`). Tested in `src/__tests__/paging.test.ts`.
- `WD_API_URL` (default `http://localhost:3000/api/v1`) + `WD_API_KEY` load via `loadCliEnv()` in `src/env.ts`, validated on first API use, not on `--help`. A key acts in one organization (`metadata.organizationId`; legacy keys act in the owner's oldest organization); a foreign-org `caseId` is `not_found`, no organization is 403. Dotenv loads from the cwd, then parent directories.
- Custody (guidance plus tests in `custody.test.ts` and `custody-cli.test.ts`): default to `wd proposals create`. Child Graph writes need `--user-override` and refuse `confirmed` (the rule is `childWriteViolation` in `@watchdog/policy`, shared with the API; `custody.ts` only maps it to a `CUSTODY` envelope); `wd graph write` always sends `userOverride: true`. There is no `wd` accept or reject: Triage Accept is a human decision, so `proposals.accept` and `proposals.reject` need a signed-in session and refuse an API key; only a person accepting in Triage sets `confirmed`. Secrets are entered in Settings → Credentials (`wd credentials list` shows which slots are set), never argv or `Job.input`.

## Gotchas

- There is no `wd cases delete`, `restore` or purge, no `wd credentials put` or `delete` and no egress flag on `wd cases update`: Case delete and restore, credential writes, organization settings and a Case's third-party egress switch need a signed-in session (an owner or admin for delete, restore and egress), so an API key is refused whatever its scopes (#369). Deleting is a tombstone (Deleted Cases, the worker purges after `WD_CASE_RETENTION_DAYS`, default 30); an owner or admin deletes, restores and purges in the web app. Listing deleted Cases is not in the CLI.
- `wd jobs start -i` must be a JSON object, not an array or bare string.
- `--dry-run` on destructive verbs prints the planned JSON only; it does not validate against the API.
- `wd evidence process|enrich` is the Intake path (dedupes active Jobs, asserts http(s)); `wd jobs start --cap evidence.harvest` works but skips that glue.
- File uploads PUT to the presigned URL with exactly the `headers` the server returns, including the signed `x-amz-meta-sha256`.
- Update verbs send `expectedVersion` (#307): `--expected-version <n>` (`src/versions.ts`), else the verb reads the row's version first (claims, events and questions need `--entity` for that read or the flag). A stale one prints `stale_version` with the current version (`failStaleVersion` in `src/io.ts`). List rows carry `version`.
- Update verbs take partial patches (at least one field). For `identifiers` / `claims` / `edges`, `--notes ""` and `--evidence ""` clear the field; omitting the flag leaves it.
- Brand at the edge (ADR-0003): `--case` goes through `requireCaseId` (`parseTrimmedCaseId`, returns `CaseId`) and every other positional uuid through `requireUuid` (`parseTrimmedUuid`, plain string); an invalid id is a `USAGE` error via `fail`, never a throw and never a cast.
