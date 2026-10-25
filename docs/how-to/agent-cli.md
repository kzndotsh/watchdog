# Agent and CLI (`wd`)

**What this is:** how to point agents and automation at the HTTP API (OpenAPI at `/api/v1`, JSON by default) and the `wd` CLI.  
**What this is not:** Cap authoring ([`../reference/platform/caps-boundary.md`](../reference/platform/caps-boundary.md)), web ServerFn paths ([`../reference/web/architecture.md`](../reference/web/architecture.md)), or the verb list (`wd --help`).

Agents and the CLI share one OpenAPI contract via `@watchdog/client`. The default graph path is **propose**; an explicit graph write is the escape hatch ([`../reference/contracts/agent-ingress.md`](../reference/contracts/agent-ingress.md) owns those rules).

## Setup

1. Run web: `pnpm dev:web` (local API base `http://127.0.0.1:3000/api/v1`).
2. Settings → **API Keys** → create a key (personal `wd_` keys). Pick a preset (Agent: read and propose; Collector: also add evidence; Full: all four scopes) or switch scopes one by one; the key is shown once. A key acts in the organization that was active when you created it (`metadata.organizationId`), is re-checked against your membership on every call, and stops working if you leave that organization. A key with no stored scopes or no organization is refused (401), never read-only or tied to an organization by default. Authed `/api/v1` calls require an organization: sessions use `activeOrganizationId`; a missing org is **403**, not 401.
3. In `.env` or the shell:

```bash
WD_API_URL=http://localhost:3000/api/v1
WD_API_KEY=<key-from-settings>
```

4. After `pnpm install` and `pnpm build:cli`, `wd` is available via `pnpm exec wd` (or `node_modules/.bin/wd`). `wd --help` works without a key; authenticated verbs need both vars (`loadCliEnv()`). From the repo root, dotenv picks up `.env`.

After API changes run `pnpm generate:client` (writes `packages/client/src/generated/`; CI fails on drift). `@watchdog/api`, `@watchdog/client` and `@watchdog/cli` pin TypeScript to the workspace version in their `package.json`; do not float it.

## Interactive API docs

`/api/v1/` is the Scalar UI (session or API key); `/api/v1/spec.json` is the OpenAPI JSON. The web UI uses in-process ServerFns, not HTTP oRPC; only agents and the CLI use `/api/v1`.

## Notes by verb

- **Delete:** there is no `wd cases delete`, `restore` or purge: deleting a Case is a tombstone (it moves to Deleted Cases, its queued and running Jobs are cancelled, and the worker purges it after `WD_CASE_RETENTION_DAYS`, default 30), and an owner or admin does it, restores it and purges it at once in the web app, signed in; an API key is refused. The same holds for the Case's allowed egress (`wd cases update` has no egress flags; an owner or admin changes it in the Case's settings). **Hard delete:** `wd identifiers delete` (needs `--user-override`), `wd edges delete`, `wd events delete`, `wd questions delete` ship. There is no `wd entities delete` (entity delete is OpenAPI-only: `DELETE …/entities/{entityId}`).
- **Updates and `stale_version`:** every Graph update verb (`wd entities|identifiers|edges|claims|events|questions update`) sends the row's `version` as `expectedVersion`. List output has a `version` column; pass it as `--expected-version <n>` for a real compare-and-set. Without the flag the verb reads the row's current version first (identifiers, edges, entities by a case read; claims, events and questions by `--entity <slug>`, otherwise the flag is required), which only protects the gap between that read and the write. If the row changed, the verb prints `error.code: "stale_version"` (HTTP 409, nothing written), says the row is now at version N, and the fix is to read it again and retry with `--expected-version N`. `wd graph write` patch ops take an optional `expectedVersion` per op; a stale one fails the whole patch. Contract: [`custody`](../reference/contracts/custody.md#optimistic-concurrency).
- **Jobs and playbooks:** `wd jobs start --cap network.dns.lookup --input '{"host":"example.com"}'`; `wd jobs retry <jobId>` (a new Job with the same Cap and input, linked to the finished original; failed, cancelled and succeeded Jobs only); `wd jobs playbook`; `wd jobs playbook-run <runId>` (a run's outcome and each step's outcome: `succeeded`, `failed`, `running`, `pending`, or `skipped` with a `reason` built from the step that held it back (`blockedBy`), e.g. `step 0 (network.dns.lookup) failed`; steps are numbered from zero); `wd jobs get <jobId>` on a step of a run adds the same under `playbookRun`, and `wd jobs list` shows a finished run's `outcomeLabel` (`Succeeded`, `Partial`, `Failed`). A retry of a failed step (`wd jobs retry`) resumes the run and its skipped dependents; `wd caps list` / `wd caps playbooks`.
- **Job start limits:** a Job start over the organization's or the key's limit prints `error.code` `job_start_limited` with `error.status` 429 and `error.retryAfterSeconds`; nothing was started, so run the same command again after the wait. `wd export zip` of a large Case starts an export Job and is refused the same way. Limits and what counts: [`job-start-limits`](job-start-limits.md).
- **Evidence:** `wd evidence paste | url | file | process | enrich | hide | restore | download`.
- **Credentials:** `wd credentials list` shows which slots are configured. Adding or removing one is Settings → Credentials in the web app (signed in); an API key cannot, so there is no `wd credentials put` or `delete`. The vault never returns plaintext; slot semantics are in [`caps-boundary.md`](../reference/platform/caps-boundary.md#cap-credentials). Missing required credentials block Run in the UI and fail Jobs closed.
- **Export:** `wd export zip` / `wd export md` use binary file routes with `x-api-key`. A Case with more Evidence than `WD_EXPORT_INLINE_MAX_MB` (default 100) is built by a Job instead: the server answers 202 with the Job, and `wd export zip` waits for it (polling every 5 seconds, up to two hours), then streams the archive to the output file. The download link expires `WD_EXPORT_LINK_TTL_HOURS` (default 24) after the archive is stored. The archive carries the provider calls behind its Evidence (`provider-calls.jsonl`, `ATTRIBUTION.md`, `VERIFY.md`) with each response's hash; raw responses are added only by a signed-in owner or admin (`?rawBodies=1`), never by an API key, which gets `forbidden`. Over plain HTTP the same flow is `GET …/export.zip` (202, `Location`), then `GET …/exports/{jobId}` (202 while it runs, 302 to a short-lived signed URL when ready, 409 when it ended without an archive, 410 when the link expired).
- **Scopes:** a key holds scopes (`cases:read`, `evidence:write`, `proposals:write`, `graph:write`; a write scope includes read), and a key with no stored scopes is refused. A verb the key's scopes do not cover fails with `error.code: "insufficient_scope"`, the missing scope in the message, and a hint to create a key with it in Settings → API Keys. Which verb needs which scope: [`agent-ingress`](../reference/contracts/agent-ingress.md#key-scopes).
- **Who am I:** `wd auth status` prints the current credential (`apiKey` or `session`), the key id, its scopes and the organization it acts in (`auth.whoami`, a `cases:read` call every key may make), and names the scopes the key lacks.
- Jobs and evidence started with an API key show actor `api-key:<key name>` in the UI.

## Output contract

**Paging.** Lists return one page: `wd entities list -c <caseId> --limit 100` (1-200, default 50) prints `{ count, items, nextCursor }`; pass the `nextCursor` back as `--cursor` for the next page, or add `--all` to read every page in one call (no `nextCursor` then).

Owned by [`apps/cli/AGENTS.md`](../../apps/cli/AGENTS.md): compact JSON on stdout (`{ count, items }` on lists), `--table` / `--raw` / `--full`, errors `{ ok: false, error: { code, message }, help? }` with exit 1, and exit 3 for server-side failures (5xx, including export downloads) so scripts can tell them from invalid input. Enforced by the CLI unit tests.

## See also

- First investigation in the UI: [`../tutorials/first-investigation.md`](../tutorials/first-investigation.md)
- Custody / Accept tiers: [`../reference/contracts/custody.md`](../reference/contracts/custody.md)
- oRPC layout: [`../reference/platform/jobs-orpc.md`](../reference/platform/jobs-orpc.md)
- Auth and API keys: [`auth-setup.md`](auth-setup.md); symptoms: [`troubleshooting.md`](troubleshooting.md)
