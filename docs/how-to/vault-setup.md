# Vault setup

**What this is:** master vault key, Cap credential slots, Settings UI, CLI/API.  
**What this is not:** Cap SPI / `ctx.getCredential` internals ([`../reference/platform/caps-boundary.md`](../reference/platform/caps-boundary.md)).

Cap API keys and third-party secrets **never** belong in `.env` or `Job.input`. They live in the encrypted vault and load at Cap run time via `ctx.getCredential(name)`.

## 1. Master key

1. Copy [`env.example`](../../env.example) to `.env` if you have not already.
2. Generate a 32-byte key (either format works; server normalizes in `vault.ts`):

```bash
openssl rand -base64 32
# or
openssl rand -hex 32
```

3. Set `WD_MASTER_VAULT_KEY=` in `.env`. Required non-empty for server boot (`@watchdog/env/server`).
4. Restart `pnpm dev:web` and `pnpm dev:worker` after changing the key.

**Important:** Rotating or losing the master key makes existing ciphertext unreadable. `just wipe` clears case data but **keeps auth + vault** rows.

## 2. Settings UI

1. Sign in to the web app.
2. Open **Settings → Credentials** (`/settings?tab=credentials`).
3. For each Cap that needs a secret, use **Connect** / **Update** and paste the value in the dialog.

The UI lists **slots** (name, set/not set). Plaintext is never returned after save. Caps with missing required credentials fail closed at Job/playbook start and again in worker preflight.

Known slot names: `packages/caps/src/known-credentials.ts` (`KNOWN_CREDENTIALS`). After adding a Cap credential spec, regen is gated by `pnpm generate:caps`.

## 3. CLI / API (agents)

Same vault, no plaintext out:

| Surface | Usage |
| --- | --- |
| oRPC | `GET /credentials` (list slots) · `PUT` · `DELETE /credentials/{name}` |
| CLI | `wd credentials list` · put via `--stdin` or `--secret-env` |

CLI needs `WD_API_URL` + `WD_API_KEY` (create key in Settings → API Keys). See [`../reference/platform/caps-boundary.md`](../reference/platform/caps-boundary.md#cap-credentials) for credential spec shapes (`required`, `optional`, `anyOf`).

## 4. Verify

1. Set a slot the Cap declares (e.g. an AI provider key for `evidence.extract.ai`).
2. Start a Job that requires it from Collect (Process or Cap run).
3. If the slot is empty, Run is blocked in the UI with a credential gate message.

Deploy/boot vars (`DATABASE_URL`, `BETTER_AUTH_*`, S3, `WD_MASTER_VAULT_KEY`) stay in env. Only **Cap runtime secrets** use the vault.

## See also

- Agent/CLI: [`agent-cli.md`](agent-cli.md)
- Troubleshooting: [`troubleshooting.md`](troubleshooting.md)
