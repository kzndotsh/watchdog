# Agent and CLI (`wd`)

**What this is:** HTTP API + `wd` CLI for agents and automation (OpenAPI at `/api/v1`, JSON by default).  
**What this is not:** Cap authoring ([`../reference/platform/caps-boundary.md`](../reference/platform/caps-boundary.md)) or web ServerFn paths ([`../reference/web/architecture.md`](../reference/web/architecture.md)).

Agents and CLI share the same OpenAPI contract via `@watchdog/client`. Default graph path is **propose**; explicit **graph write** is the escape hatch.

## Setup

1. Run web: `pnpm dev:web` (local API base `http://127.0.0.1:3000/api/v1`).
2. Settings → **API Keys** → create a key (personal `wd_` keys; org is the creating user's membership, not an org-owned key). Authed `/api/v1` calls require that organization: session uses `activeOrganizationId` when the user is a member; API keys use the creating user's oldest membership. Missing org is **403**, not 401.
3. In `.env` or shell:

```bash
WD_API_URL=http://localhost:3000/api/v1
WD_API_KEY=<key-from-settings>
```

4. After `pnpm install` and `pnpm build:cli`, `wd` is on PATH (`pnpm exec wd` / `node_modules/.bin/wd`). `wd --help` works without a key; authenticated verbs need both vars. From the repo root, dotenv picks up `.env`.

Regenerate client after API changes: `pnpm generate:client` (writes `@watchdog/contract`). `@watchdog/api`, `@watchdog/client`, `@watchdog/contract`, and `@watchdog/cli` typecheck with workspace TypeScript **7.0.2** — keep `"typescript": "7.0.2"` in those `package.json` files; do not float `^6`.

## Interactive API docs

| URL                 | Purpose                        |
| ------------------- | ------------------------------ |
| `/api/v1/`          | Scalar UI (session or API key) |
| `/api/v1/spec.json` | OpenAPI JSON                   |

Web UI uses in-process ServerFns (`createRouterClient`), not HTTP oRPC. Agents and CLI use `/api/v1`.

## Ingress (summary)

| Action | CLI / API | Lands on Graph |
| --- | --- | --- |
| Propose (default) | `wd proposals create` · `POST …/proposals` | Pending Proposal → Triage |
| Graph write (override) | `wd graph write` · `POST …/graph/write` + `userOverride: true` | `@ unverified` + audit row |
| Child writes | `wd claims | identifiers | edges | …`+`--user-override` | Same as graph write; CLI refuses `confirmed` |

Jobs and evidence started with `WD_API_KEY` show actor `api-key:<key name>` in the UI. Session-started work shows **`By` + AtSign glyph + handle** (from `auth.user.name`, slugged; else email local-part). `actorId` on the row stays the user id (vault).

Full rules: [`../reference/contracts/agent-ingress.md`](../reference/contracts/agent-ingress.md).

## Common verbs

| Noun | Examples |
| --- | --- |
| `cases` / `entities` | `wd cases list` · create/update/delete Case. Entity/identifier **hard delete** is OpenAPI-only today (`DELETE …/entities/{entityId}`, `DELETE …/identifiers/{identifierId}` + `userOverride` on identifiers); `wd entities delete` / `wd identifiers delete` not shipped yet |
| `evidence` | `wd evidence paste` · `file` · `process` · `enrich` · `hide` |
| `jobs` | `wd jobs start --cap network.dns.lookup --input '{"host":"example.com"}'` |
| `proposals` | `wd proposals create` (patch JSON) |
| `graph write` | Escape hatch with patch + override |
| `credentials` | `wd credentials list` · `put --stdin` (never prints secrets) |
| `export` | `wd export zip` · `wd export md` (binary routes + `x-api-key`) |
| `caps` | `wd caps list` · `wd caps playbooks` |

Package detail: [`../../apps/cli/AGENTS.md`](../../apps/cli/AGENTS.md). oRPC layout: [`../reference/platform/jobs-orpc.md`](../reference/platform/jobs-orpc.md).

## Output contract

- Default stdout: compact JSON (`{ count, items }` on lists).
- `--table` for human tables; `--raw` for export/download URLs.
- Errors: `{ ok: false, error: { code, message }, help? }`, exit 1.

## Next steps

| Goal | Doc |
| --- | --- |
| Vault credentials for Caps | [`vault-setup.md`](vault-setup.md) |
| First investigation in the UI | [`../tutorials/first-investigation.md`](../tutorials/first-investigation.md) |
| Custody / Accept tiers | [`../reference/contracts/custody.md`](../reference/contracts/custody.md) |

## See also

- Auth + API keys setup: [`auth-setup.md`](auth-setup.md)
- Troubleshooting API/CLI: [`troubleshooting.md`](troubleshooting.md)
