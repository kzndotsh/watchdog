# Agent ingress contract

**What this is:** how CLI/API agents propose or write Graph under explicit override.  
**What this is not:** Cap Job path ([`../platform/caps-boundary.md`](../platform/caps-boundary.md)), custody tiers ([`custody.md`](custody.md)).

## Default: propose

- `POST …/proposals` / `wd proposals create` (`proposals:write`) → pending Proposal (`agentSourced` + `createdBy`).
- Shares Cap `proposeStage` + finding suppression.
- Prefer proposals when unsure.
- A Proposal leaves `pending` only by a person: `POST …/accept` and `POST …/reject` need a signed-in session and refuse an API key with `FORBIDDEN` (`sessionAuthed`); the CLI has no accept or reject verb. See [`custody`](custody.md).

## Key scopes

An API key carries scopes (`resource:level`); a session carries none and is never scope-checked. Every procedure declares what it needs (`.meta({ scope })`), and one middleware in `authed` (`packages/api/src/os.ts`) refuses a key that lacks it before input validation. A write scope implies `cases:read`.

| Scope | Grants |
| --- | --- |
| `cases:read` | Every read: Cases, entities, Evidence (including download URLs), Jobs, Proposals, history, search, the activity stream, Case export zip (and, for a large Case, the export Job's status and download link; the `?rawBodies=1` opt-in for raw provider responses is session-only, owners and admins, and a key gets `forbidden`) and entity export markdown, the Cap registry, credential slot lists, organization settings read |
| `evidence:write` | Collect: Evidence paste, URL, presign and confirm-file, `process` and `enrich`; Job and Playbook start, cancel and retry |
| `proposals:write` | `proposals.create` |
| `graph:write` | Graph child writes (claims, identifiers, edges, events, questions: custody still applies, explicit override and never `confirmed`), `graph.write`, entities, tasks, Evidence attach, hide and restore, Case create and update. |
| `session` (not a key scope) | `proposals.accept`, `proposals.reject`, `cases.remove` (delete), `cases.restore`, `cases.purge`, `credentials.put`, `credentials.delete`, `organization.updateSettings`: a signed-in session only, `sessionAuthed`, whatever the key's scopes or its owner's role. The credential slot list stays `cases:read`. `cases.update` keeps `graph:write` except for the Case's allowed egress: a key that sends `allowedEgress` is refused with `FORBIDDEN` (`data.code: "forbidden"`), and a session needs an owner or admin ([`custody`](custody.md)) |

- **Storage.** Better Auth's `apikey.permissions` in its native statement shape (`{ "cases": ["read"], "evidence": ["write"], "proposals": ["write"], "graph": ["write"] }`), set only on the server (`createScopedApiKey`, from the session-only `createApiKeyFn`; Better Auth's browser create endpoint is refused). `createApiContext` parses it once with `parseKeyScopes` (`@watchdog/schemas`) and puts the set on the credential: `{ kind: "apiKey", keyId, scopes }`.
- **Legacy and unreadable.** A key with no stored permissions (created before scopes) holds `cases:read` only. Permissions that cannot be parsed, or name a resource or level outside the list, deny the key (it gets no actor, like a banned owner's key).
- **Refusal.** A missing scope is `FORBIDDEN` with `data: { code: "insufficient_scope", requiredScope }` (declared by `apiErrorMap`, typed in the generated client). Routes outside the router that accept keys (Case export zip, entity export markdown, the activity stream) call the shared `requireScope(credential, "cases:read")` and answer 403 with the same body. A procedure that declares no scope refuses every key; `org-isolation-coverage.test.ts` fails when one exists, `scope-matrix.test.ts` / `scope-matrix.int.test.ts` call every procedure with and without its declared scope, and `apps/web/src/routes/api/__tests__/route-scopes.test.ts` fails when a route file under `routes/api` is neither scoped nor listed as keyless.
- **CLI.** `wd` prints `error.code: "insufficient_scope"`, names the missing scope and says a key with it is created in Settings → API Keys.

## Escape hatch: graph write

- `POST …/graph/write` / `wd graph write` (`graph:write`) with body `userOverride: true` (CLI verb _is_ the hatch: no boolean flag).
- Lands Graph @ **`unverified`** + `graph_writes` row in the **same tx** as `applyPatch`. Each applied op also appends one activity entry (agent as actor) in that tx; the entry is a live-update signal and a log row (Graph entries are not shown in Recent activity), not custody: `graph_writes` stays the complete, un-pruned, idempotent record, and a replayed `idempotencyKey` appends nothing. Each applied op also lands in `graph_history` (written by the database triggers: channel `agent_write`, the acting user, the `api-key:...` display label and the key's id (`actor_key_id`; the activity entry carries it too), `created_by` / `updated_by` on the row), see [`custody`](custody.md#attribution-and-history).
- Optional `idempotencyKey` (replay returns `replayed: true`, `opCount: 0`).
- No Proposal on this path.
- Patch ops that change an existing row accept an optional `expectedVersion` (the row's `version` from a read). A stale one fails the whole patch with `stale_version` (409) and applies nothing; an op without it overwrites the row as it stands. See [`custody`](custody.md#optimistic-concurrency).

## Child writes

- `wd claims|identifiers|edges|events|questions …` require **`--user-override`**.
- CLI **refuses `confidence=confirmed`** (Triage Accept / Dossier may set `confirmed`). The API refuses it for API keys too. Both apply the single rule `childWriteViolation` in `@watchdog/policy` (override first, then confirmed) and only map the violation to `FORBIDDEN` (API) or a `CUSTODY` envelope (CLI).
- `caseId` must belong to the actor’s organization; foreign-org Case → **`not_found`**.
- Updates (`entities|identifiers|edges|claims|events|questions` PATCH) require **`expectedVersion`** (the `version` the agent last read). A row that changed since fails with HTTP 409, `data.code: "stale_version"` and `data.currentVersion`; nothing is written. The CLI takes `--expected-version <n>` and reads the row's current version when it is omitted. See [`custody`](custody.md#optimistic-concurrency).

## Pure prep

- `parseAgentPatch` + `assertPatchShape` (policy). Cap Jobs still set `agentSourced=false`.
- CLI output: compact JSON by default; see [`apps/cli/AGENTS.md`](../../../apps/cli/AGENTS.md).

## Enforced by

oRPC `graphChildWrite` middleware and the CLI custody envelopes (`apps/cli`, unit-tested); `sessionAuthed` on `proposals.accept` / `proposals.reject` (key path of the isolation matrix) and on the other session-only actions (`session-only.int.test.ts`); `graph_writes` atomicity and `idempotencyKey` replay by `packages/api` integration tests. Cap Jobs and agents share `proposeStage` finding suppression (see [`../platform/caps-boundary.md`](../platform/caps-boundary.md)). This page is the single home for these rules; other docs link here.
