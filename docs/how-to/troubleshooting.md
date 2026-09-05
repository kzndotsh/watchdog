# Troubleshooting

**What this is:** symptom → cause → fix for local dev, Collect/Jobs, auth, and agents.  
**What this is not:** test methodology ([`../contributing/testing/index.md`](../contributing/testing/index.md)) or product IA ([`../explanation/ux.md`](../explanation/ux.md)).

## Jobs and Collect

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Jobs stay **queued** | Worker not running | Second terminal: `pnpm dev:worker` |
| **Run** disabled on Cap/Playbook | Missing vault credential or Case egress off | Settings → Credentials; Case Overview → allow third-party egress for AI/third-party Caps |
| Job **succeeded**, amber **interpret failed** | Cap `interpret` error; artifacts OK | Re-run or fix Entity attachment; Proposal may be absent by design |
| Cancelled Job still running ~2s | Worker abort poll | Normal; wait for `cancelled` |
| Stale **running** >60s | Worker reclaim | Worker boot runs `reconcileStaleJobs`; restart worker if stuck |
| Collect URL has wrong selection | Search param is `?id=` (Evidence or Job uuid) | Not `?jobId=`; command palette uses `?id=` |

## Auth and API

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Cannot sign in on fresh install | Signup closed | `BETTER_AUTH_ALLOW_SIGNUP=1` → `/auth/sign-up` → set `0` ([`auth-setup.md`](auth-setup.md)) |
| Sign-in 401, log `User not found`, account exists | Missing `auth.account.issuer` after Better Auth 1.7 | `pnpm db:migrate` (adds `local:credential` on credential rows) |
| Invitee cannot register | Public sign-up is closed on purpose | Use the invitation link (`/auth/accept-invitation/{id}`), not `/auth/sign-up` |
| Invitation email missing | SMTP unset | Copy link on Settings → Team; optional `SMTP_HOST` + `SMTP_FROM`. URL is also in evlog |
| Signed out but UI still “in” | Stale session cache | Sign out via `/auth/sign-out` (BA UI), not raw `authClient.signOut()` |
| ServerFn **403** with `csrf` in logs | CSRF middleware | Expected on bad CSRF token; see [`auth-setup.md#gotchas`](auth-setup.md#gotchas) |
| `wd` commands fail auth | Missing `WD_API_KEY` | Create key in Settings; set `WD_API_URL` + `WD_API_KEY` |
| Vault Connect fails | Empty `WD_MASTER_VAULT_KEY` | Generate key in `.env` ([`vault-setup.md`](vault-setup.md)) |

## Data and infra

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Evidence upload fails | MinIO not initialized | `just up` or `just minio-init` after fresh volume |
| Migrations fail | DB not up / wrong URL | `just up` · check `DATABASE_URL` / `DATABASE_URL_MIGRATE` |
| Stale Case data after experiments | Need wipe | `just wipe yes` (keeps auth including organizations + vault) |
| Route 404 after new route file | Generated route tree | `pnpm generate-routes` or restart `pnpm dev:web` |
| Integration/e2e DB missing | Test DBs | `just test-db` |

## Triage

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **Accept** disabled | Invalid Identifier op in patch | Fix value or Reject; see [`../reference/contracts/custody.md`](../reference/contracts/custody.md) |
| **confirmed** blocked | Zero evidence / attestation rules | Add evidence links or lower tier |
| Collision warning | Same identifier on another Entity | Warn only; Accept still allowed |

## Next steps

| Goal | Doc |
| --- | --- |
| Daily commands | [`local-dev.md`](local-dev.md) |
| Agent/CLI reference | [`agent-cli.md`](agent-cli.md) |
| Journey status matrix | [`../explanation/scenarios.md`](../explanation/scenarios.md) |

## See also

- Web traps index: [`../reference/web/README.md#traps-index`](../reference/web/README.md#traps-index)
- CI / local gates: [`../contributing/ci-gates.md`](../contributing/ci-gates.md)
