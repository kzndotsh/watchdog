# Troubleshooting

**What this is:** symptom → cause → fix, for causes that are not obvious from the owning doc. Rows that only repeat one step of another doc are omitted: for a closed sign-up see [`auth-setup.md`](auth-setup.md), for `wd` auth see [`agent-cli.md`](agent-cli.md), for vault keys see [`caps-boundary.md`](../reference/platform/caps-boundary.md#cap-credentials).  
**What this is not:** test methodology ([`../contributing/testing/index.md`](../contributing/testing/index.md)) or product IA ([`../explanation/ux.md`](../explanation/ux.md)).

## Jobs and Collect

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Jobs stay **queued** | Worker not running | Second terminal: `pnpm dev:worker` |
| **Run** disabled on Cap/Playbook | Missing vault credential, or Case third-party egress off | Settings → Credentials; Case Overview → allow third-party egress for AI/third-party Caps |
| Job **succeeded** but shows **interpret failed** | Cap `interpret` threw; artifacts are fine | Re-run or fix the Entity attachment; no Proposal by design |
| Cancelled Job keeps running for a moment | The worker polls for cancels | Normal; wait for `cancelled` |
| Job stuck **running** | Worker died mid-run | Restart the worker: boot runs `reconcileStaleJobsEffect` (reclaim age derives from the Cap's `timeoutMs`) and re-enqueues orphaned `queued` Jobs |
| Collect URL selects the wrong row | The search param is `?id=` (Evidence or Job uuid) | Use `?id=`, not `?jobId=` |

## Auth

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Sign-in 401, log `User not found`, account exists | Missing `auth.account.issuer` after Better Auth 1.7 | `pnpm db:migrate` (adds `local:credential` on credential rows) |
| Invitee cannot register | Public sign-up is closed on purpose | Use the invitation link `/auth/accept-invitation/{id}`, not `/auth/sign-up` |
| Invitation email missing | SMTP unset | Copy the link from Settings → Organization → Members → Pending invitations; the URL is also in process logs |
| Signed out but UI still "in" | Stale session cache | Sign out via `/auth/sign-out`, not raw `authClient.signOut()` |
| ServerFn **403** with `csrf` in logs | CSRF middleware rejected the request | Expected for a bad token; see [`auth-setup.md#gotchas`](auth-setup.md#gotchas) |

## Data and infra

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Evidence upload fails | Bucket not initialized, or (deployed) CORS lacks `x-amz-meta-sha256` | `just up` or `just s3-init` after a fresh volume; on a deployed bucket allow `Content-Type` and `x-amz-meta-sha256` in `AllowedHeaders` |
| Migrations fail | DB not up / wrong URL | `just up`; check `DATABASE_URL` / `DATABASE_URL_MIGRATE` |
| Route 404 after adding a route file | Generated route tree | `pnpm generate-routes` or restart `pnpm dev:web` |
| Integration/e2e DB missing | Test DBs not created | `just test-db` |

## Triage

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **Accept** disabled | Invalid Identifier op in the patch | Fix the value or Reject ([`custody.md`](../reference/contracts/custody.md)) |
| **confirmed** blocked | No evidence linked | Add evidence links or lower the tier |

Collision warnings are warn-only; Accept still works ([`custody.md`](../reference/contracts/custody.md)).

## See also

- Web traps index: [`../reference/web/README.md#traps-index`](../reference/web/README.md#traps-index)
- Local stack: [`local-dev.md`](local-dev.md); gates: [`../contributing/ci-gates.md`](../contributing/ci-gates.md)
