# CLI package (`@watchdog/cli`)

> Scope: `packages/cli` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

`wd` CLI — talks to the API via `@watchdog/client` only (no direct DB). Binary export uses authenticated `fetch` (not on the oRPC contract).

## Commands

| Task | Command |
| --- | --- |
| Run locally | `pnpm --filter @watchdog/cli start -- <args>` |
| Typecheck | `pnpm --filter @watchdog/cli typecheck` (workspace TypeScript **7.0.2**; exact pin in `package.json`) |
| Unit tests | `pnpm test:unit` |

### Surface (agent ingress)

| Noun | Notes |
| --- | --- |
| `cases` / `entities` | CRUD-ish; `cases update --name` regenerates slug; `cases delete` cascades Graph/Jobs/Evidence; `entities update` is summary/notes only (name/slug stay) |
| `claims` / `identifiers` / `edges` / `events` / `questions` | `list` free; writes need `--user-override` |
| `evidence` | list/paste/url/file + `hide` / `restore` / `download` + `process` / `enrich` |
| `export zip` / `export md` | binary GETs via `x-api-key` |
| `jobs` | list/start/cancel + `get` / `playbook` / `cancel-playbook`. `wd jobs playbook` seeds: `--host --url --evidence --ip --email --hash --handle` plus `--entity`. Start queues step 0 only. |
| `caps list` / `caps playbooks` | Cap catalog + playbook list |
| `credentials` | `list` / `put` (`--stdin` / `--secret-env`) / `delete` |
| `proposals` / `graph write` | Default agent path vs escape hatch |

Noun with no subcommand = content-first list (or USAGE fail needing `-c`).

### Output contract (agent-first)

- **Default:** compact JSON on stdout. Lists: `{ "count", "items", "help?" }`. Mutations: object or `{ "ok": true, … }`. Errors: `{ "ok": false, "error": { "code", "message" }, "help?" }` (stdout), exit 1; unknown flags exit 2. ORPC errors and tagged `_tag` domain errors (`NotFoundError` / `ConflictError` / `InvalidError` / `ForbiddenError`) map into that envelope in `handleCliError`. The CLI still talks HTTP via `@watchdog/client` (same application programs as the API, not in-process core Effects).
- **`--table`:** human ASCII tables for lists.
- **`--full`:** restore untruncated / full fields (list projections are minimal by default).
- **`--raw`:** bare path/URL for `export` / `evidence download` (shell `$(…)`).
- **`--json`:** no-op (JSON is default).
- **`help[]`:** ≤3 next-step templates on lists/empty/errors; disable with `WD_CLI_HELP=0`.
- **`WD_CLI_DEBUG=1`:** print stacks on stderr.

### Env

- `WD_API_URL` (default local) + `WD_API_KEY` via `loadCliEnv()` — validated on first API use, not on `--help`.

## Boundaries

| Do | Don’t |
| --- | --- |
| Use `createWatchdogClient` + `loadCliEnv()` | Import `@watchdog/core` / `@watchdog/db` |
| Default: proposals (`wd proposals create`) | Silent Graph writes |
| Child Graph writes: `--user-override` + refuse `confirmed` | Set `confirmed` on claims/identifiers/edges from CLI |
| Inbox Accept may set `confirmed` (`wd proposals accept --confidence`) | Treat Accept and child-write custody as the same rule |
| Vault via `wd credentials` / `PUT /credentials` | Put secrets on argv or in Cap `Job.input` |

## Gotchas

- Evidence upload helpers live here; hashes/immutability still follow Intake rules.
- `wd evidence process|enrich` is the Intake path (dedupe active Jobs; Enrich asserts http(s)). `wd jobs start --cap evidence.harvest` still works but skips that glue.
- Export is outside `contract.json` — CLI checks `res.ok` before writing files.
- `events update` accepts a partial patch — provide at least one of `--when`, `--what`, or `--where`.
- Destructive verbs support `--dry-run` (prints planned JSON only — does **not** validate against the API).
- Paste body: `--body`, `-b -`, `--stdin`, or non-TTY stdin.
- Breaking: `wd caps` → `wd caps list` (also content-first `wd caps`).
- Tests: `--help` / output contract, `CUSTODY` JSON when child writes omit `--user-override`, `loadPatch` reject paths. Live API is e2e / integration, not CLI unit.

## See also / External References

| Need        | File                                               |
| ----------- | -------------------------------------------------- |
| HTTP client | [`packages/client/AGENTS.md`](../client/AGENTS.md) |
| CLI env     | [`packages/env/AGENTS.md`](../env/AGENTS.md)       |
