# Agent and CLI (`wd`)

**What this is:** how to point agents and automation at the HTTP API (OpenAPI at `/api/v1`, JSON by default) and the `wd` CLI.  
**What this is not:** Cap authoring ([`../reference/platform/caps-boundary.md`](../reference/platform/caps-boundary.md)), web ServerFn paths ([`../reference/web/architecture.md`](../reference/web/architecture.md)), or the verb list (`wd --help`).

Agents and the CLI share one OpenAPI contract via `@watchdog/client`. The default graph path is **propose**; an explicit graph write is the escape hatch ([`../reference/contracts/agent-ingress.md`](../reference/contracts/agent-ingress.md) owns those rules).

## Setup

1. Run web: `pnpm dev:web` (local API base `http://127.0.0.1:3000/api/v1`).
2. Settings → **API Keys** → create a key (personal `wd_` keys). A key acts in the organization that was active when you created it (`metadata.organizationId`), is re-checked against your membership on every call, and stops working if you leave that organization; keys from before multi-org use your oldest organization. Authed `/api/v1` calls require an organization: sessions use `activeOrganizationId`; a missing org is **403**, not 401.
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

- **Hard delete:** `wd cases delete`, `wd identifiers delete` (needs `--user-override`), `wd edges delete`, `wd events delete`, `wd questions delete` ship. There is no `wd entities delete` (entity delete is OpenAPI-only: `DELETE …/entities/{entityId}`).
- **Jobs and playbooks:** `wd jobs start --cap network.dns.lookup --input '{"host":"example.com"}'`; `wd jobs playbook`; `wd caps list` / `wd caps playbooks`.
- **Evidence:** `wd evidence paste | url | file | process | enrich | hide | restore | download`.
- **Credentials:** `wd credentials list`, and `put` via `--stdin` or `--secret-env`. The vault never returns plaintext; slot semantics are in [`caps-boundary.md`](../reference/platform/caps-boundary.md#cap-credentials). Missing required credentials block Run in the UI and fail Jobs closed.
- **Export:** `wd export zip` / `wd export md` use binary file routes with `x-api-key`.
- Jobs and evidence started with an API key show actor `api-key:<key name>` in the UI.

## Output contract

Owned by [`apps/cli/AGENTS.md`](../../apps/cli/AGENTS.md): compact JSON on stdout (`{ count, items }` on lists), `--table` / `--raw` / `--full`, errors `{ ok: false, error: { code, message }, help? }` with exit 1, and exit 3 for server-side failures (5xx, including export downloads) so scripts can tell them from invalid input. Enforced by the CLI unit tests.

## See also

- First investigation in the UI: [`../tutorials/first-investigation.md`](../tutorials/first-investigation.md)
- Custody / Accept tiers: [`../reference/contracts/custody.md`](../reference/contracts/custody.md)
- oRPC layout: [`../reference/platform/jobs-orpc.md`](../reference/platform/jobs-orpc.md)
- Auth and API keys: [`auth-setup.md`](auth-setup.md); symptoms: [`troubleshooting.md`](troubleshooting.md)
