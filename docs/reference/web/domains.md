# Domains: `src/domains/`

This document maps product surfaces to their owning folders and defines where I/O lives. For UI details, see [`UI.md`](UI.md) and [`ui/`](ui/README.md). For investigator flows, see [`docs/explanation/ux.md`](../../../docs/explanation/ux.md).

## Shape

Use this TanStack Start-aligned split. Omit files that do not have a clear responsibility.

```
domains/{noun}/
  components/              # React UI: imports queries + *.functions + types + hooks
  types.ts                 # DTOs + Zod input schemas (import schemas atoms; no vocab re-export)
  queries.ts               # queryOptions + key factories (import Fns; no side effects)
  {noun}.functions.ts      # RPC surface: createServerFn → orpcForActor (preferred)
  {noun}.server.ts         # omit unless web-local secrets/cookies (no Drizzle)
  hooks/                   # React hooks (workspace / forms / Query): no createServerFn, no *.server
  lib/                     # pure helpers (filters, views, formOptions, status maps)
```

| File | Owns | UI may import? |
| --- | --- | --- |
| `*.functions.ts` | Domain RPC: `createServerFn` + `.validator(schema)` + thin `orpcForActor` handlers | Yes |
| `*.server.ts` | Rare web-local secrets/cookies (`server-only`): **not** SQL | **No** |
| `types.ts` | DTOs + Zod input schemas (Record types often re-exported from `@watchdog/core`) | Yes |
| `queries.ts` | `queryOptions` + keys only (no components, no invalidate side effects) | Yes |
| `hooks/*` | Client React hooks that call Fns / Query / local UI state | Yes |
| `lib/*` | Pure filters, status maps, formOptions, browser helpers (no React hooks) | Yes |
| `*.client.ts` | True browser-only utils (rare) | Client only |

Invalidation contracts live in `shared/lib/query-invalidation.ts` (not in `queries.ts`). Data rules: [`data.md`](data.md).

Zod / schemas contract: [`docs/reference/platform/types.md`](../../../docs/reference/platform/types.md).

### Naming

- **`*.functions`** = things you _call_ across the network (RPC). Not "client code."
- **`*.server`** = must never ship to the browser (cookies / rare local secrets only).
- **`*.client`** is wrong for server functions (they run on the server during SSR/loaders).

### What goes in `lib/` vs `hooks/`

| Put in `lib/` | Put in `hooks/` | Do not put in either |
| --- | --- | --- |
| Pure transforms / filters | Workspace hooks (`use-*-workspace`) | `createServerFn` → `*.functions.ts` |
| Status / label maps (no I/O) | Form / blob / table hooks that call Fns | Domain writes → oRPC / `@watchdog/core` |
| `formOptions` / pure validators | Section editors / invalidate helpers | DTOs / Zod → `types.ts` |
| Browser helpers that aren't components |  | React UI → `components/` |
|  |  | Graph child RPC → `entities/{child}/` |

Cross-domain plumbing hooks stay in `shared/hooks/` (e.g. `use-live-events`). UI-kit hooks stay next to their atom (e.g. `shared/ui/data-table/use-data-table.ts`).

Omit `lib/` / `hooks/` when the domain has nothing but components + functions.

**Dossier section chrome:** shared create/edit state lives in `dossier/hooks/use-dossier-section-editor.ts` (`adding` / `editId` / `error` + empty gate). Shell data (counts, evidence options, rename/edit mutations, live invalidation) lives in `dossier/hooks/use-dossier-shell.ts`. Export actions: `dossier/components/dossier-export-menu.tsx`. Ghost / panel Add CTAs use `dossier/components/dossier-section-add-button.tsx`. Evidence tab dump (File/Paste/URL, Entity locked) lives in `entity-evidence-section.tsx` via Intake `useDumpEvidence` + `DumpDialogs`: no `dossier.functions.ts`. Confirmed↔evidence Accept gate + copy: `dossier/lib/confirmed-evidence.ts` (also used by Triage + connection dialog). Claim create/edit share `dossier/lib/claim-form.ts` (`formOptions`) via one `ClaimComposer`. Section Graph writes (claims / questions / identifiers / events / connections) use `useMutation`: do not leave bare `await …Fn()` siblings beside mutation-backed create/update.

### Graph children (`entities`)

```
domains/entities/
  components/
  types.ts
  entities.functions.ts    # orpcForActor → api.entities.*
  claims/                  # types.ts + claims.functions.ts (no .server.ts)
  identifiers/ …
  edges/ …                 # graph Edge CRUD; Dossier surface = Connections tab
  events/ …
  questions/ …
```

SQL for graph children lives in `@watchdog/db` `repos` + `@watchdog/core` services + `@watchdog/api` procedures. Dossier chrome stays under `dossier/components/`: no `dossier.functions.ts`.

**Connections UI** (not under `edges/`):

- **Dossier:** `dossier/components/connections-section.tsx` + `dossier/components/ego-graph/*` (list, dialog, ego canvas). Full confidence + evidence.
- **Entities table:** `entity-connections-cell.tsx` + `connection-composer-fields.tsx` (chips ≤2 + `+N` browse; Add/edit popover; relationship then peer). Always `unverified`, no evidence.
- **Shared writes:** `entities/lib/edge-write.ts` (`buildCreateEdgeData` / `buildUpdateEdgeData`): both surfaces. Peers index: `entities/lib/connection-peers.ts`. Phrase helpers: web `shared/ui/vocab/edge-predicate.ts` (`preferredEdgePhrase` / `clampEdgePhrase` / grouped `edgePhraseOptions`).
- **Bulk add identifiers** (table + Dossier): public parse API `entities/lib/parse-identifier-paste.ts` (ingest; identity in `infer-paste-identity.ts`, resolve in `resolve-identifier-paste.ts`). Paste UI state lives in `entities/lib/use-bulk-add-identifiers-paste.ts`. Dialog `entities/components/bulk-add-identifiers-dialog.tsx` (paste, then left/right column match). Type comes from the column or values: no required Type default. Default Entity fills **empty** Entity cells only; a mapped name/slug miss stays empty and shows **Not found** / **Ambiguous** on the Entity cell (does not silently use the default). Preview cells are editable (empty Type/Platform = **: **, not the field name). Also accepts markdown tables, labeled notes, JSON, profile URLs, mailto/tel, bullets. One `useMutation` loops `createIdentifierFn`. Dossier locks Entity (mapper hides the Entity destination). Row errors from schemas `validateIdentifierWrite` (value + handle→platform): do not fork a second regex set. Inline edit commits share `entities/lib/commit-identifier-field.ts`.
- Edge RPC stays `entities/edges/` (entity-scoped + case-wide `listForCase`). Shared graph chrome: `shared/ui/graph/` (`GraphCanvas`, `EntityNode`, `GraphEdgePath`). Case graph page: `cases/components/case-graph/*` + `graph-page.tsx` (`/graph`).

## Rules

1. One noun = one product concern. Don't put Cap run chrome under Triage.
2. Prefer `@/domains/{noun}/...` imports (no relative hops between domains).
3. No `createServerFn` inside `components/`, `hooks/`, `lib/`, or `queries.ts`.
4. Handlers call **`orpcForActor(actorFromSession(...)).…`** for domain I/O (same pattern as `jobs` / `triage` / graph children).
5. `lib/` and `hooks/` never import `*.server.ts`. Hooks may call `*.functions` only.
6. **Never import `@watchdog/db` from web domains**: oxlint-enforced; allowlist only `auth/server.ts` + `routes/api/events.ts`.
7. Domains with RPC inputs keep Zod in `types.ts` (jobs/triage included).
8. Domains with server lists keep `queries.ts`; invalidate via `shared/lib/query-invalidation.ts`.

## Map

| Domain | Owns | Route(s) | Entry UI | ServerFns |
| --- | --- | --- | --- | --- |
| `collect` | Evidence ingress + Cap/Job runs (merged queue) | `/collect` | `collect.tsx` composes `use-collect-workspace` → `CollectDetail` / `CollectQueueBody` / `CollectRunFormPanel` (Evidence tabs + job/playbook run forms); queue `collect-queue-list.tsx` + `collect-queue-toolbar.tsx`; index/detail builders under `lib/collect-*.ts` + `lib/collect-filters.ts` | Reuses `intake.functions.ts`, `jobs.functions.ts` + domain queries |
| `triage` | Proposals: accept / reject | `/triage` | `triage.tsx` → `TriageDetail` → `triage-decide-header.tsx` (context strip) + `triage-patch-body.tsx` + `triage-decide-footer.tsx` (shared `lib/decide-header-view.ts` `decideMode`); identifier collision Alert + per-op chip (warn, don't block); invalid Identifier ops via schemas `listInvalidIdentifierOps` (chip + **disable Accept**); workspace `hooks/use-triage-workspace.ts` (filters, selection, accept/reject, SSE); forms `hooks/use-triage-detail-forms.ts`; Accept gate `lib/accept-gate.ts` + `lib/accept-validation.ts` + `dossier/lib/confirmed-evidence.ts`; confidence UI via `@watchdog/policy/patch-needs-confidence` (not the `@watchdog/policy` barrel — Effect stays off the client); Accept composer DTO `AcceptFormValues` in `types.ts` | `triage.functions.ts` + `types.ts` + `queries.ts` |
| `intake` | Evidence RPC + shared detail components (no standalone route) | : (via Collect) | `evidence-detail.tsx`, `process-run-card.tsx`, dump dialogs/forms; consumed by Collect + Dossier Evidence tab | `intake.functions.ts` + `types.ts` + `queries.ts` |
| `jobs` | Cap Jobs RPC + shared job detail/artifact/run forms (no standalone route) | : (via Collect) | `job-detail.tsx`, `artifact-content.tsx`, `job-cap-run-form.tsx` / `job-playbook-run-form.tsx` (+ shared `playbook-seed-fields.tsx`); workspace `hooks/use-jobs-workspace.ts` | `jobs.functions.ts` + `queries.ts` |
| `entities` | Entity CRUD + graph children (entity-scoped + case-wide identifiers/edges reads) | `/entities`, `/identifiers` | `entity-table.tsx` + Connections cell; `identifiers-page.tsx` (case-wide table) | `entities.functions.ts` + `{claims,edges,identifiers,…}/queries.ts` |
| `dossier` | Subject dossier chrome (editable title + `EntityKindGlyph`; `DossierEditDialog`; Notes + Tasks tabs use `density="split"`: Notes fills `RichTextEditor`, Tasks = entity-scoped `TaskBoard`; Evidence tab dumps File/Paste/URL via Intake hook with Entity locked) | `/entities/$slug` | `dossier.tsx` (+ `hooks/use-dossier-shell.ts`, `dossier-export-menu.tsx`), section chrome per § hooks/lib, `summary-notes-section.tsx` (`RichTextEditor` Markdown blur-autosave), `dossier-edit-dialog.tsx`, `entity-evidence-section.tsx` | Uses entities / intake / tasks queries + Fns |
| `cases` | Case list + Case Overview dashboard + active Case context | `/cases`, `/cases/$caseSlug` (+ cookie; UUID/`?tab=` redirects) | `case-list.tsx`, `case-overview.tsx` (dashboard only), `graph-page.tsx` (`/graph`), Overview tab `lib/overview-activity.ts` + `case-settings-form.tsx`; Case switcher lists flat Overview / Entities / Identifiers / Graph (Dashboard via WATCHDOG logo) | `cases.functions.ts` + `types.ts` + `queries.ts` (`caseBySlugQuery`) + `lib/active-case*` |
| `tasks` | Case work board (kanban) + dossier tab | `/tasks` (`?entityId=`) | `tasks-page`, `task-board` (columns = `TASK_STATUSES` from `@watchdog/schemas`: no domain `board.ts` alias), `lib/task-board-dnd.ts` (`reconcileItems` keeps optimistic order), `task-form-dialog`, `dossier-tasks-section`; shared `useTaskWorkspace` (`reorderTasksFn` / `handleCommitDrop`). `task-table` / `case-tasks-tab` are unused (Case Overview has no Tasks tab). | `tasks.functions.ts` + `types.ts` + `queries.ts` |
| `settings` | Settings page (sidebar: Account / Security / Team / Users / API Keys / Credentials) | `/settings` (`?tab=`) | `settings-shell`, `settings-credentials-form` (+ `settings-credentials-handlers` bind* helpers); Team tab is `auth/ui/team`; Users tab is `auth/ui/users` (instance admin only) | `settings.functions.ts` + `types.ts` + `queries.ts` |
| `activity` | Cross-case recent activity read model (evidence / jobs / pending proposals / tasks) | : (data-only) | : | `activity.functions.ts` + `types.ts` + `queries.ts` |
| `search` | Shell Mod+K command palette + Shortcuts sheet (Jump to + Active Case `searchCase`) | : (shell chrome) | `search-chrome.tsx` / `command-palette.tsx` (mounted from `AppShell`) | `search.functions.ts` + `types.ts` + `queries.ts` |
| `dashboard` | Dashboard (`/`): stats + Triage + Due + resizable Activity (`ScrollArea`) | `/` | `dashboard-home.tsx` (`Page density="split"` + vertical `ResizablePanelGroup`), `metrics-section.tsx`, `dashboard-panels.tsx`, `recent-activity.tsx`, `lib/selectors.ts` | Composes other domains' queries (+ `recentActivityQuery`) |

Auth is not a domain noun: it lives under `src/auth/`:

| Path | Owns |
| --- | --- |
| `auth/` runtime (`client`, `server`, `session.server`, `ensure-session`, `middleware`, …) | Better Auth + route/API session; ServerFn `requireAuth` is wired globally in `src/start.ts` (not per domain `*.functions.ts`) |
| `auth/invite-signup-*.ts` + `invite-sign-up-*.ts` | Invite accept / sign-up plugin, schemas, endpoint, and flow helpers (split from a single mega-module) |
| `auth/ui/` | BA UI account/security/sign-in views (vendor-shaped) |
| `auth/plugins/` | BA UI plugin wiring (e.g. API keys) |
| `domains/settings` | Settings shell + Cap credentials UI: BA account/security live under `auth/ui/` |

Shared chrome under `src/shared/`.

## Page ownership

| Layout kind | Route owns | Domain entry owns |
| --- | --- | --- |
| **Split-view** (Collect, Triage) | Thin loader (identity + `warmCollectQueries` / `warmTriageQueries`) | `<Page density="split">` + `PageHeader` + `SplitView`; queue/detail **`PendingRegion`** + hand skeletons (`QueueSkeleton`, `CollectDetailSkeleton`); Triage split in **`RegionBoundary`** → `TriageSplitPendingFallback` |
| **Table** (`/entities`, `/identifiers`) | Thin loader + `warmEntitiesQueries` / `warmIdentifiersQueries` | `<Page>` + `PageHeader` + `DataTable` with `pending={listPending(...)}`: per-cell skeletons, not `PendingRegion` ([`tables.md`](ui/tables.md)) |
| **Board** (`/tasks`) | Thin loader + `warmTasksQueries` | `<Page>` + `PageHeader` + `TaskBoard`; board slot **`PendingRegion`** + `BoardSkeleton` |
| **Card grid** (`/cases`) | Thin loader (identity only) | `case-list.tsx`; grid slot **`PendingRegion`** + `CardGridSkeleton` |
| **Graph** (`/graph`) | Thin loader + `ensureGraphQueries` | `graph-page.tsx`; `GraphCanvasLoadingRegion` while suspense; then `CaseGraphCanvas` |
| **Stack** (Dossier, Case Overview, Dashboard) | Thin loader + matching `warm*` helper | Full `<Page>` shell; tab bodies **`ActiveTabBody`** / **`RegionBoundary`** + `stackPendingFallback()`; Case Overview pending uses **`CaseOverviewPending`** |
| **Mixed / split stack** (Dashboard) | Thin loader + `warmDashboardQueries` | `dashboard-home.tsx`: `Page density="split"`; Activity panel in `RegionBoundary` |
| **Settings** | `<Page>` + `PageHeader` | `SettingsShell` + tab panels; credentials tab **`Suspense`** + `stackPendingFallback(1)` |

Split-view domains own the full page shell including `<Page>` (Collect/Triage pattern). Table/board/stack domains own the shell in the domain entry (`actions=`, `count=` + `countOn=` on table/board last crumbs, and `below=` line tabs live with the tab state they drive). Identity is the PageHeader trail: see [`page-shell.md`](ui/page-shell.md). Do not pass per-page identity titles or explainer `description=` (404 missing-slug copy only).

## Cross-domain rules

| Need | Do |
| --- | --- |
| Entity picker | `EntityCombobox`: parent passes options (no I/O in combobox). Intake dump toolbar + File/Paste/URL dialogs share one target Entity (Unattached allowed). Dossier Evidence dump locks Entity (`DumpDialogs` `entityLocked`; `useDumpEvidence`) |
| Entities Connections column | `/entities` joins `edgesForCaseQuery`; chips = direction arrow (`↗` out / `↙` in) + peer name; hover `title` = full phrase (e.g. “Associate of John Doe”). ≤2 chips + `+N` browse; hover-reveal `+` opens Add/edit popover (`connection-composer-fields`; relationship first). Defaults via `preferredEdgePhrase` / `clampEdgePhrase`; semantic-group Combobox. Writes via `lib/edge-write.ts` @ `unverified` (no evidence). Dossier Connections uses the same builders + full confidence/evidence dialog. Interactive controls are buttons so row-click still opens dossier. Actions column: Open entity / Copy link / Copy Markdown / Delete (`DeleteEntityDialog` type-name confirm). |
| Identifiers table | `/identifiers`: `identifiers-page.tsx` + `hooks/use-identifiers-table.ts` + `identifiers-table.columns.tsx`. Columns: Entity · Value · Type · Platform · Status · Confidence · Evidence · Notes (narrow icon) · Actions (Open identifier / Copy value / Delete). SearchField + PageFilterMenu (Type / Status / Confidence `columnFilters`). Loading: `DataTable` `pending` (not `PendingRegion`). In-place create reuses `useIdentifierCreateForm` + optional Entity combobox; Evidence links via the Evidence column (popover `EvidencePicker`, same control as row edit). Notes open a right Sheet with `RichTextEditor` Markdown (blur/close autosave) — not an inline cell. **Bulk add** = dialog + `parse-identifier-paste.ts` + `use-bulk-add-identifiers-paste.ts` (Dossier Identifiers reuses the same dialog; Entity locked). Preview cells editable; mapped Entity miss → **Not found** / **Ambiguous**. Row click → Dossier Identifiers. Do not put this table under `cases/`. |
| Artifact bytes in Detail | Domain wrapper / parent loads (`ArtifactContent` + `getArtifactContentFn`) |
| Evidence options in dossier / Triage | Parent loads Case Evidence (`evidenceListQuery(caseId)`: full Case list; EvidencePicker needs every dump). Pass options as **`readonly EvidenceOption[]`** (picker props are readonly). Dossier Evidence tab client-filters `entityId` and dumps via `useDumpEvidence` (Intake RPC). Dossier composers → `EvidencePicker` (chip-height Add/+ · checklist; `layout="panel"` inside identifier Link popovers). Job-linked Triage cites → `EvidenceCiteChips` (read-only; no Add). Both live in `dossier/components/evidence-picker.tsx` (re-exports `shared/ui`). |
| Case switch | `cases` + `CASES_CHANGED_EVENT`: see [`data.md`](data.md) |
| Task surfaces | `useTaskWorkspace(caseId, { entityId?, live? })` owns queries / mutations / selection / dialogs. `handleCommitDrop` = status change (cross-column) + `reorderTasks` (`position` within the dest column). Dossier section passes `live: false`: parent dossier already listens for `task_changed` (tab counts). Do not fork a third create/edit machine. |
| Jobs workspace | `useJobsWorkspace(caseId, { jobId, onJobIdChange, …, jobsListFetching? })` owns selection, detail fetch, cap/playbook start/cancel, SSE `job_update`. Collect wraps it in `useCollectWorkspace` (queue filters, intake dump, selection sync). On start: seed list+detail cache before `onJobIdChange` so URL selection resolves without a Navigate remount. Run UI: `JobCapRunForm` / `JobPlaybookRunForm` in Collect. Do not fork a second jobs mutation machine. |
| Triage workspace | `useTriageWorkspace(caseId, { proposalId, initialStatus })` owns filters, selection, accept/reject mutations, SSE `proposal_created`. First paint = pending-only (`PENDING_TRIAGE_FILTERS`). URL auto-fallback via `<Navigate replace>` + `resolveQueueSelection`. `decide-header-view` / footer / workspace call `patchNeedsConfidence` from `@watchdog/policy/patch-needs-confidence` only — do not import the policy package root (pulls Effect into the browser). Do not fork a second triage mutation machine. |
| Identifier evidence column | `shared/ui/identifiers/identifier-evidence-cell.tsx`: labeled chip summary + edit popover (Save); preview click when Dossier wires `onEvidenceClick`; confirmed gate disables Save. Used by Dossier Identifiers and `/identifiers`. |
| Identifier notes column | `shared/ui/identifiers/identifier-notes-cell.tsx`: sticky-note icon → right Sheet + `RichTextEditor` Markdown (blur/close autosave). Narrow column (~52). Used by Dossier Identifiers and `/identifiers`. |
| Dashboard | Composes triage / tasks / jobs / entities / activity queries; selection helpers in `dashboard/lib/selectors.ts`. Activity = vertical resizable panel + `ScrollArea` (`recent-activity.tsx`). Do not put dump/paste on Dashboard: Collect owns dump. |
| Command palette / hotkeys | `domains/search` + `shared/lib/hotkeys.ts` / `use-global-hotkeys`. Mod+K / Mod+B / `?` registered in `SearchChrome` (inside `SidebarProvider`). Do not add a second window listener in shadcn sidebar. |
| Predicate / confidence / kind | Options from `@watchdog/schemas` (+ web `vocab/` labels). Connection create/edit uses `edgePhraseOptions` / `FieldCombobox` with schema `group` headings: no freestyle predicate strings. Do not fork `resolveEdgeEndpoints` payloads; use `entities/lib/edge-write.ts`. |

## Anti-patterns

- New `createServerFn` inside a component file
- Importing `*.server.ts` from a client component or from `lib/`
- Importing DTOs / form value types from `components/` into `lib/` or `hooks/` (put them in `types.ts`)
- Fetch/mutate inside `shared/ui` atoms
- Duplicating Queue/Detail chrome instead of shared atoms ([`UI.md`](UI.md))
- Putting dossier section logic under `entities/components/` (table Connections cell + shared `connection-composer-fields` / `edge-write` are the exception: dossier keeps the full Dialog)
- Graph child RPC under `entities/lib/` (use `entities/{child}/`; `lib/edge-write.ts` is payload builders only, not RPC)
- Alias files that only re-export schema consts (e.g. deleted `tasks/lib/board.ts`)
- Forking edge create/update endpoint resolution outside `entities/lib/edge-write.ts`
- Remounting Entities columns from a global `connectionBusy` flag: keep saving state local to the open cell
- Dual toast + inline error for the same table connection mutation (prefer inline in the popover)

## Gotchas

- **Dashboard Activity**: cross-case feed (`recentActivityQuery`) has no dedicated SSE type; soft-invalidate via named contracts (`invalidateAfterTaskMutation` / job / proposal / evidence). UI: vertical resizable panel under overview (`Page density="split"`) with `ScrollArea` inside `recent-activity.tsx`. Rows link to `/cases/$caseSlug` only (resolve slug from Cases context; cookie-scoped routes like `/collect` / `/triage` / `/tasks` must not be deep-linked from a foreign Case). Case filter lives on that section alone: do not re-scope Collect/Triage panels to a non-active Case without addressing Active Case routing. Task rows come from append-only `activity_events` (create / status_changed / deleted) so status diffs are real `from → to`, not inferred from the current task row; evidence / jobs / pending proposals are still live-row snapshots until those paths write events too. Evidence, job, and task rows show **`By` + handle** (or `api-key:…`); do not display raw `actorId`.
- **Vocab in UI**: edge predicates, confidence, kinds come from `@watchdog/schemas` directly (do not re-export via domain `types.ts` / `*.functions.ts`). Freestyle options in dossier pickers drift from the write gate. Connection create stores `{predicate, orientation}`; encode/decode phrases only at the `FieldCombobox` boundary (`edgePhraseValue` / `parseEdgePhraseValue`). Phrase options carry schema `group` → Combobox section headings (`EDGE_PREDICATE_GROUP_LABELS`). Use `preferredEdgePhrase` / `clampEdgePhrase` for kind-pair defaults: do not reintroduce a private dossier `clampRelation`.
- **Task due dates**: UI is `<input type="date">` / `LocalDateTime dateOnly`. Persist via `dueDateToIso` (local noon ISO) so calendar-day semantics survive timezone display; overdue is day-based (`isTaskDueOverdue`), not wall-clock; Dashboard "Tasks due soon" / Due panel uses `isTaskDueSoon(..., 7)` (today + 7 calendar days, excluding overdue).
- **Task board DnD**: cross-column drag changes status; within-column drag persists order via `reorderTasks` (`position`, then `createdAt` in the repo). `reconcileItems` keeps optimistic placement across refetch: do not drop reorder without updating `position` on the server.
- **Dashboard "Jobs running"**: tile count uses `LIVE_STATUSES` (`queued` + `running`), not `running` alone.
