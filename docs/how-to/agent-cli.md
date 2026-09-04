# Agent and CLI (`wd`)

**What this is:** HTTP API + `wd` CLI for agents and automation (OpenAPI at `/api/v1`, JSON by default).  
**What this is not:** Cap authoring ([`../reference/platform/caps-boundary.md`](../reference/platform/caps-boundary.md)) or web ServerFn paths ([`../reference/web/architecture.md`](../reference/web/architecture.md)).

Agents and CLI share the same OpenAPI contract via `@watchdog/client`. Default graph path is **propose**; explicit **graph write** is the escape hatch.

## Setup

1. Run web: `pnpm dev:web` (local API base `http://127.0.0.1:3000/api/v1`).
2. Settings → **API Keys** → create a key.
3. In `.env` or shell:

```bash
WD_API_URL=http://localhost:3000/api/v1
WD_API_KEY=<key-from-settings>
```

4. `wd --help` works without a key; authenticated verbs need both vars.

Regenerate client after API changes: `pnpm generate:client`. `@watchdog/api`, `@watchdog/client`, and `@watchdog/cli` typecheck with workspace TypeScript **7.0.2** — keep `"typescript": "7.0.2"` in those `package.json` files; do not float `^6`.

## Interactive API docs

| URL                 | Purpose                        |
| ------------------- | ------------------------------ |
| `/api/v1/`          | Scalar UI (session or API key) |
| `/api/v1/spec.json` | OpenAPI JSON                   |

Browser RPC for the web app uses `/api/rpc` (not the CLI path).

## Ingress (summary)

| Action | CLI / API | Lands on Graph |
| --- | --- | --- |
| Propose (default) | `wd proposals create` · `POST …/proposals` | Pending Proposal → Triage |
| Graph write (override) | `wd graph write` · `POST …/graph/write` + `userOverride: true` | `@ unverified` + audit row |
| Child writes | `wd claims | identifiers | edges | …`+`--user-override` | Same as graph write; CLI refuses `confirmed` |

Full rules: [`../reference/contracts/agent-ingress.md`](../reference/contracts/agent-ingress.md).

## Common verbs

| Noun | Examples |
| --- | --- |
| `cases` / `entities` | `wd cases list` · create/update/delete Case |
| `evidence` | `wd evidence paste` · `file` · `process` · `enrich` · `hide` |
| `jobs` | `wd jobs start --cap network.dns.lookup --input '{"host":"example.com"}'` |
| `proposals` | `wd proposals create` (patch JSON) |
| `graph write` | Escape hatch with patch + override |
| `credentials` | `wd credentials list` · `put --stdin` (never prints secrets) |
| `export` | `wd export zip` · `wd export md` (binary routes + `x-api-key`) |
| `caps` | `wd caps list` · `wd caps playbooks` |

Package detail: [`../../packages/cli/AGENTS.md`](../../packages/cli/AGENTS.md). oRPC layout: [`../reference/platform/jobs-orpc.md`](../reference/platform/jobs-orpc.md).

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
