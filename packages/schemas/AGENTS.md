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
- `IDENTIFIER_TYPES` includes `ip` (IPv4/IPv6 syntax). Normalize in `normalize-identifier.ts`; soft-strict value checks + write gate (`validateIdentifierWrite` = value + handle→platform) + Inbox preflight `listInvalidIdentifierOps` in `validate-identifier.ts` (schemas-local; do not import `@watchdog/tools` / `node:net`).
- Identifier PATCH fields: `identifierUpdateFieldsSchema` in `identifier-update.ts` — web `updateIdentifierInputSchema` and API `identifiers.update` both `.extend` its `.shape` (do not fork parallel optional field objects).
- Case work enums: `TASK_STATUSES` / `TASK_PRIORITIES` (kanban columns + priority; Task ≠ Graph write). `TASK_STATUSES.blocked` is a kanban column — not `JOB_STATUSES.blocked` (historical playbook Job wait).
- Playbook atoms in `vocab.ts`: `PLAYBOOK_SEED_KINDS` (`host|url|evidence|ip|email|hash|handle`), `HANDOFF_BAGS` / `JobHandoff`, `OPEN_JOB_STATUSES` + `isOpenJobStatus` (`queued|running|blocked`), `PLAYBOOK_RUN_STATUSES` (`running|finished|cancelled`). Keep `blocked` in `JOB_STATUSES` / `OPEN_JOB_STATUSES` for leftover rows; new playbook Jobs are `queued`.
- Dashboard Activity wire shape: `ACTIVITY_KINDS` / `activityItemSchema` in `activity.ts` (api + web re-export; do not fork).

## See also / External References

| Need | File |
| --- | --- |
| Types contract | [`docs/reference/platform/types.md`](../../docs/reference/platform/types.md) |
| Edge predicates + inverses + phrase groups | [`docs/reference/platform/types.md` § Platform edge predicates](../../docs/reference/platform/types.md) |
| Playbooks | [`docs/reference/platform/caps-lexicon.md`](../../docs/reference/platform/caps-lexicon.md) |
