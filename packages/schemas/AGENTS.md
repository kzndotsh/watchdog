# Schemas package (`@watchdog/schemas`)

> Scope: `packages/schemas` (inherits root AGENTS.md)

Shared atoms: vocab, `PatchOp`, snapshots, job-artifact ids, identifier normalize + validate. Zod + TypeScript only.

## Commands

| Task           | Command                                     |
| -------------- | ------------------------------------------- |
| Typecheck      | `pnpm --filter @watchdog/schemas typecheck` |
| Unit tests     | `pnpm test:unit`                            |
| Property tests | `pnpm test:property`                        |

## Rules

- No DB, Caps, or app imports — leaf dependency.
- Enums/vocab stay here; drizzle uses `text().$type<T>()`, never `pgEnum` for domain vocab.
- Prefer extending existing primitives over parallel one-off types.
- `IDENTIFIER_TYPES` includes `ip` (IPv4/IPv6 syntax). Normalize in `normalize-identifier.ts` (IPv6: lowercase + RFC 5952 compress when syntactically valid; malformed `:::` left as-is for validate to reject); soft-strict value checks + write gate (`validateIdentifierWrite` = value + handle→platform) + Inbox preflight `listInvalidIdentifierOps` in `validate-identifier.ts` (schemas-local; do not import `@watchdog/tools` / `node:net`).
- Identifier PATCH: `updateIdentifierInputSchema` in `identifier-update.ts` — web/API/CLI identifier update share it (includes scope + at-least-one refine).
- Identifier POST: `createIdentifierInputSchema` in `identifier-create.ts` — web/API/CLI identifier create share it (includes `validateIdentifierWrite` superRefine).
- Claim/event/question POST: `createClaimInputSchema`, `createEventInputSchema`, `createQuestionInputSchema` — web/API/CLI create share them.
- Claim/event/question PATCH: `updateClaimInputSchema`, `updateEventInputSchema`, `updateQuestionInputSchema` — web/API/CLI update share them.
- Claim retract POST: `retractClaimInputSchema` in `claim-retract.ts`.
- Entity POST/PATCH: `createEntityInputSchema`, `updateEntityInputSchema` in `entity-create.ts` / `entity-update.ts`.
- Edge POST/PATCH: `createEdgeInputSchema`, `updateEdgeInputSchema`, `deleteEdgeInputSchema` in `edge-create.ts` / `edge-update.ts`.
- Proposal / graph patch POST: `proposalPatchFieldsSchema`, `createProposalInputSchema`, `acceptProposalInputSchema`, `rejectProposalInputSchema` in `proposal-ingress.ts`; `graphWriteInputSchema` in `graph-write.ts`.
- Job POST/GET scope: `startJobInputSchema`, `startPlaybookInputSchema`, etc. in `job-ingress.ts`.
- Case POST/PATCH fields: `createCaseFieldsSchema`, `updateCaseFieldsSchema`, `updateCaseInputSchema`, `deleteCaseInputSchema` — web/API/CLI case create, update, and delete share them.
- Graph scope ids: `entityScopeInputSchema`, `questionScopeInputSchema`, etc. in `graph-scope.ts` — list/detail routes share them.
- Question resolve POST: `resolveQuestionFieldsSchema`, `resolveQuestionInputSchema` in `question-resolve.ts`.
- Evidence paste/URL POST: `dumpPasteInputSchema`, `dumpUrlInputSchema` in `evidence-ingest.ts` — web intake, API evidence create, and CLI evidence paste/url share them.
- Evidence file upload fields: `evidenceUploadFieldsSchema`, `presignUploadInputSchema`, `confirmFileUploadInputSchema` in `evidence-upload.ts` — web intake, API evidence presign/confirm, and CLI upload share them (`confirmFileUploadInputSchema` enforces `{caseId}/{sha256}` uri prefix; rejects `..`).
- Credential PUT/DELETE: `putCredentialInputSchema`, `deleteCredentialInputSchema` in `credential-put.ts`.
- Case slug lookup: `getCaseBySlugInputSchema` in `case-update.ts` (slugifies via `entitySlugSchema`).
- Entity DELETE: `deleteEntityInputSchema` in `entity-update.ts`.
- Case work enums: `TASK_STATUSES` / `TASK_PRIORITIES` (kanban columns + priority; Task ≠ Graph write). `TASK_STATUSES.blocked` is a kanban column — not `JOB_STATUSES.blocked` (historical playbook Job wait).
- Playbook atoms in `vocab.ts`: `PLAYBOOK_SEED_KINDS` (`host|url|evidence|ip|email|hash|handle`), `HANDOFF_BAGS` / `JobHandoff`, `OPEN_JOB_STATUSES` + `isOpenJobStatus` (`queued|running|blocked`), `PLAYBOOK_RUN_STATUSES` (`running|finished|cancelled`). Keep `blocked` in `JOB_STATUSES` / `OPEN_JOB_STATUSES` for leftover rows; new playbook Jobs are `queued`.
- Dashboard Activity wire shape: `ACTIVITY_KINDS` / `activityItemSchema` in `activity.ts` (api + web re-export; do not fork).
- SSE `/api/events` optional `caseId` query: `parseSseCaseIdParam` in `activity.ts` (trim + UUID; whitespace-only or invalid → 400). Client subscriptions: `normalizeSseCaseId` (`parseTrimmedCaseId` under the hood).
- Scoped UUID trim helper: `parseTrimmedCaseId` in `primitives.ts` (trim + UUID; invalid → `null`). Used by SSE, active-case cookie, worker export scheduler, and web query-key scoping.

## See also / External References

| Need | File |
| --- | --- |
| Types contract | [`docs/reference/platform/types.md`](../../docs/reference/platform/types.md) |
| Edge predicates + inverses + phrase groups | [`docs/reference/platform/types.md` § Platform edge predicates](../../docs/reference/platform/types.md) |
| Playbooks | [`docs/reference/platform/caps-lexicon.md`](../../docs/reference/platform/caps-lexicon.md) |
